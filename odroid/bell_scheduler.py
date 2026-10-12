#!/usr/bin/env python3
"""Durable, fail-closed Shelly bell scheduler and authenticated local API."""
import copy, datetime as dt, fcntl, json, os, re, sqlite3, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from urllib.error import URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

HOST=os.environ.get('KENNEMER_BELL_HOST','0.0.0.0'); PORT=int(os.environ.get('KENNEMER_BELL_PORT','8788')); TOKEN_ENV='KENNEMER_MAINTENANCE_TOKEN'
RELAYS=({'id':'a8032abc4264','ip':'10.10.80.162'}, {'id':'08b61fd8993c','ip':'10.10.80.161'})
PROFILES=('regular','short','ten-minute'); ZONE='Europe/Amsterdam'; TIMEOUT=2.5
BASE=Path(__file__).resolve().parent
DB_PATH=Path(os.environ.get('KENNEMER_BELL_DB','/var/lib/kennemer/bell/bell.sqlite3'))
DEFAULTS_PATH=Path(os.environ.get('KENNEMER_BELL_DEFAULTS',str(BASE/'bell-defaults.json')))

class BellError(Exception): pass

def rpc(relay, method, params=None):
    if relay not in RELAYS: raise BellError('unknown relay')
    url='http://%s/rpc' % relay['ip']
    body=json.dumps({'id':1,'method':method,'params':params or {}}).encode()
    req=Request(url, data=body, headers={'Content-Type':'application/json'}, method='POST')
    try:
        with urlopen(req, timeout=TIMEOUT) as response:
            if response.status != 200: raise BellError('relay HTTP error')
            data=json.loads(response.read(65537))
            if not isinstance(data,dict) or 'error' in data or not isinstance(data.get('result'),dict): raise BellError('relay RPC error')
            return data['result']
    except (URLError, TimeoutError, OSError, ValueError) as e: raise BellError('relay unavailable: '+type(e).__name__)

def relay_check(relay):
    info=rpc(relay,'Shelly.GetDeviceInfo')
    identity=str(info.get('id','')).lower().endswith('-'+relay['id']) and str(info.get('model','')).startswith('SNSW-001') and info.get('gen') == 2
    cfg=rpc(relay,'Switch.GetConfig',{'id':0})
    return {'id':relay['id'],'reachable':True,'identity_ok':identity,
            'initial_state_off':cfg.get('initial_state')=='off',
            'auto_off_seconds':cfg.get('auto_off_delay') if cfg.get('auto_off') is True else None}

def relay_ready(relay):
    h=relay_check(relay)
    if not h['identity_ok'] or not h['initial_state_off'] or h['auto_off_seconds'] not in (1,1.0):
        raise BellError('relay not commissioned: '+relay['id'])
    return h

def read_switch(relay):
    d=rpc(relay,'Switch.GetStatus',{'id':0}); return d.get('output') is False

def pulse(relay):
    relay_ready(relay)
    if not read_switch(relay): raise BellError('relay is not off before pulse')
    rpc(relay,'Switch.Set',{'id':0,'on':True,'toggle_after':1})
    deadline=time.monotonic()+2.0; saw_on=False
    while time.monotonic()<deadline:
        off=read_switch(relay)
        if not off:saw_on=True
        elif saw_on:return {'ok':True,'relay':relay['id']}
        time.sleep(.1)
    raise BellError('relay pulse did not complete on then off')

_sequence_lock=threading.Lock()
def fire(count,gap,simulation=False):
    if count not in (1,2): raise BellError('count must be one or two')
    if not _sequence_lock.acquire(blocking=False): return {'ok':False,'error':'bell sequence already active'}
    outcomes=[]
    try:
      for i in range(count):
        if simulation: result={'ok':True,'simulated':True,'relays':[{'ok':True,'relay':r['id'],'simulated':True} for r in RELAYS]}
        else:
            # Both relays receive each pulse concurrently; preserve partial results.
            out=[None,None]
            def run(i,relay):
                try: out[i]=pulse(relay)
                except Exception as exc: out[i]={'ok':False,'error':str(exc)}
            ts=[threading.Thread(target=run,args=(j,r),daemon=True) for j,r in enumerate(RELAYS)]
            [t.start() for t in ts]; [t.join() for t in ts]
            result={'ok':all(x is not None and x.get('ok') for x in out),'relays':out}
        outcomes.append(result)
        if not result['ok']: break
        if i+1<count: time.sleep(gap)
      return {'ok':len(outcomes)==count and all(x['ok'] for x in outcomes),'pulses':outcomes}
    finally:_sequence_lock.release()

class Store:
    def __init__(self,path=DB_PATH,defaults=DEFAULTS_PATH):
        self.path=Path(path); self.defaults_path=Path(defaults); self.lock=threading.RLock()
        self.path.parent.mkdir(parents=True,exist_ok=True)
        with self.db() as c:
            c.executescript('CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(event_key TEXT PRIMARY KEY,kind TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,outcome TEXT); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);')
            if not c.execute('SELECT 1 FROM config').fetchone(): c.execute('INSERT INTO config VALUES(1,1,?)',(json.dumps(self.defaults()),))
    @contextmanager
    def db(self):
        c=sqlite3.connect(self.path,timeout=5); c.row_factory=sqlite3.Row
        try:
            c.execute('PRAGMA journal_mode=WAL'); c.execute('PRAGMA synchronous=FULL')
            with c: yield c
        finally:c.close()
    def defaults(self): return json.loads(self.defaults_path.read_text())
    def get(self):
        with self.db() as c:r=c.execute('SELECT revision,body FROM config WHERE id=1').fetchone()
        body=json.loads(r['body']);body.pop('holiday_dates',None);body.pop('date_profiles',None)
        return r['revision'],body
    def set(self,rev,body):
        body=copy.deepcopy(body);body.pop('holiday_dates',None);body.pop('date_profiles',None)
        validate(body)
        with self.lock,self.db() as c:
            row=c.execute('SELECT revision,body FROM config WHERE id=1').fetchone()
            if row['revision']!=rev: raise Conflict()
            backup=self.path.with_suffix(self.path.suffix+'.bak')
            tmp=backup.with_suffix(backup.suffix+'.tmp')
            with open(tmp,'w') as f:
                json.dump({'revision':row['revision'],'config':json.loads(row['body'])},f,indent=2);f.flush();os.fsync(f.fileno())
            os.replace(tmp,backup)
            nxt=rev+1;c.execute('UPDATE config SET revision=?,body=? WHERE id=1',(nxt,json.dumps(body)))
        return nxt
    def claim(self,key,kind):
        with self.db() as c:
            try:c.execute('INSERT INTO events VALUES(?,?,?, ?,NULL)',(key,kind,'claimed',utcnow()))
            except sqlite3.IntegrityError:return False
        return True
    def finish(self,key,outcome):
        with self.db() as c:c.execute('UPDATE events SET status=?,outcome=? WHERE event_key=?',('done' if outcome.get('ok') else 'failed',json.dumps(outcome),key))
    def event(self,key):
        with self.db() as c:r=c.execute('SELECT event_key,status,created,outcome FROM events WHERE event_key=?',(key,)).fetchone()
        return dict(r) if r else None
    def recent(self):
        with self.db() as c:r=c.execute("SELECT event_key,status,created,outcome FROM events ORDER BY created DESC LIMIT 1").fetchone()
        return dict(r) if r else None
    def meta(self,k,v=None):
        with self.db() as c:
            if v is not None:c.execute('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(k,str(v)))
            r=c.execute('SELECT value FROM meta WHERE key=?',(k,)).fetchone()
        return r['value'] if r else None

class Conflict(Exception): pass
def utcnow(): return dt.datetime.now(dt.timezone.utc).isoformat()
def validate(c):
    if not isinstance(c,dict) or c.get('timezone')!=ZONE or c.get('active_profile') not in PROFILES: raise ValueError('invalid config')
    if not isinstance(c.get('paused'),bool) or not isinstance(c.get('weekdays'),list) or not c['weekdays'] or len(set(c['weekdays']))!=len(c['weekdays']) or any(type(x)!=int or x not in range(5) for x in c['weekdays']):raise ValueError('invalid schedule')
    gap=c.get('gap_seconds');
    if type(gap) not in (int,float) or not 0<=gap<=30:raise ValueError('gap_seconds out of range')
    profiles=c.get('profiles')
    if not isinstance(profiles,dict) or set(profiles)!=set(PROFILES):raise ValueError('invalid profiles')
    for name,entries in profiles.items():
        if not isinstance(entries,list) or len(entries)>200:raise ValueError('invalid profile entries')
        seen=set()
        for ent in entries:
            if isinstance(ent,str): s=ent
            elif isinstance(ent,dict) and set(ent)<= {'time','count'}: s=ent.get('time'); count=ent.get('count',1); 
            else: raise ValueError('invalid entry')
            if isinstance(ent,str):
                m=re.fullmatch(r'(\d\d:\d\d)(?:x([12]))?',s)
                if not m:raise ValueError('invalid time')
                s=m.group(1);count=int(m.group(2) or 1)
            if not isinstance(s,str) or not re.fullmatch(r'\d\d:\d\d',s) or int(s[:2])>23 or int(s[3:])>59 or type(count)!=int or count not in (1,2) or s in seen:raise ValueError('invalid event')
            seen.add(s)

class Scheduler:
    def __init__(self,store=None,clock=None):self.store=store or Store();self.clock=clock or dt.datetime.now;self.last_scan=None;self.skipped=0;self.prev_wall=None;self.prev_mono=None;self.started_at=None;self.suppress_until=0
    def now(self):return self.clock().astimezone(ZoneInfo(ZONE))
    def synchronized(self):
        if os.environ.get('KENNEMER_BELL_SIMULATION')=='1':return True
        try:
            return subprocess.run(['timedatectl','show','-p','NTPSynchronized','--value'],capture_output=True,text=True,timeout=1).stdout.strip()=='yes'
        except Exception:return False
    def due(self,now=None):
        now=now or self.now(); rev,c=self.store.get()
        if c['paused'] or not self.synchronized():return []
        date=now.date(); ds=date.isoformat()
        if date.weekday()>=5 or date.weekday() not in c['weekdays']:return []
        prof=c['active_profile']
        result=[]
        for ent in c['profiles'][prof]:
            if isinstance(ent,str):
                m=re.fullmatch(r'(\d\d:\d\d)(?:x([12]))?',ent); stamp=m.group(1); count=int(m.group(2) or 1)
            else:stamp=ent['time'];count=ent.get('count',1)
            hour,minute=map(int,stamp.split(':')); target=dt.datetime.combine(date,dt.time(hour,minute),ZoneInfo(ZONE)); age=(now-target).total_seconds()
            if 0<=age<=30:result.append((f'{ds}/{prof}/{stamp}',count,c['gap_seconds']))
            elif 30<age<=300:
                key=f'{ds}/{prof}/{stamp}'
                if self.store.claim(key,'missed'):
                    self.skipped+=1;self.store.finish(key,{'ok':False,'skipped':'late'})
        return result
    def tick(self):
        now=self.now(); mono=time.monotonic()
        if self.prev_wall is not None:
            jump=(now.timestamp()-self.prev_wall)-(mono-self.prev_mono)
            if abs(jump)>3:
                self.skipped+=1;self.suppress_until=mono+31;self.prev_wall=now.timestamp();self.prev_mono=mono;self.started_at=None;return
        self.prev_wall=now.timestamp();self.prev_mono=mono;self.last_scan=now.isoformat()
        if not self.synchronized():
            self.started_at=None
            return
        if self.started_at is None:self.started_at=now.timestamp()
        if mono<self.suppress_until:return
        for key,count,gap in self.due(now):
            if self.store.claim(key,'scheduled'):
                scheduled_date,_,scheduled_time=key.split('/')
                scheduled_at=dt.datetime.fromisoformat(scheduled_date+'T'+scheduled_time).replace(tzinfo=ZoneInfo(ZONE)).timestamp()
                if scheduled_at < self.started_at:
                    self.store.finish(key,{'ok':False,'skipped':'service started after scheduled time'});self.skipped+=1;continue
                out=fire(count,gap,os.environ.get('KENNEMER_BELL_SIMULATION')=='1');self.store.finish(key,out)
    def next_event(self,now=None):
        now=now or self.now(); _,c=self.store.get()
        if c['paused']:return None
        upcoming=[]
        for advance in range(8):
            day=now.date()+dt.timedelta(days=advance)
            if day.weekday()>=5 or day.weekday() not in c['weekdays']:continue
            profile=c['active_profile']
            for entry in c['profiles'][profile]:
                stamp=(entry if isinstance(entry,str) else entry['time']).split('x')[0]
                hour,minute=map(int,stamp.split(':'))
                target=dt.datetime.combine(day,dt.time(hour,minute),ZoneInfo(ZONE))
                if target>now:upcoming.append((target,{'at':target.isoformat(),'profile':profile,'time':stamp}))
        return min(upcoming,key=lambda event:event[0])[1] if upcoming else None
    def loop(self):
        while True:
            try:self.tick()
            except Exception as e:self.store.meta('last_error',str(e)[:240])
            time.sleep(.5)

class Handler(BaseHTTPRequestHandler):
    server_version='KennemerBell/1'
    def log_message(self,*a):pass
    def send(self,status,payload):
        raw=json.dumps(payload).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def auth(self):
        token=os.environ.get(TOKEN_ENV,'')
        import hmac
        return bool(token) and hmac.compare_digest(self.headers.get('x-kennemer-maintenance-token',''),token)
    def body(self):
        n=int(self.headers.get('Content-Length','0'))
        if n<0 or n>65536:raise ValueError('invalid body size')
        d=json.loads(self.rfile.read(n))
        if not isinstance(d,dict):raise ValueError('object required')
        return d
    def do_GET(self):
        if not self.auth():return self.send(401,{'ok':False,'error':'unauthorized'})
        if self.path=='/config':
            rev,c=self.server.scheduler.store.get();return self.send(200,{'revision':rev,'config':c})
        if self.path=='/status':
            s=self.server.scheduler; rev,c=s.store.get(); health=[]
            def check_health(relay):
                if os.environ.get('KENNEMER_BELL_SIMULATION')=='1':
                    return {'id':relay['id'],'reachable':True,'identity_ok':True,'initial_state_off':True,'auto_off_seconds':1,'output_off':True,'simulated':True}
                try:
                    item=relay_check(relay);item['output_off']=read_switch(relay);return item
                except Exception as e:return {'id':relay['id'],'reachable':False,'error':str(e)}
            with ThreadPoolExecutor(max_workers=2) as pool:health=list(pool.map(check_health,RELAYS))
            now=s.now(); next_event=s.next_event(now)
            return self.send(200,{'ok':True,'paused':c['paused'],'enabled':not c['paused'],'simulation':os.environ.get('KENNEMER_BELL_SIMULATION')=='1','clock':{'synchronized':s.synchronized(),'timezone':ZONE,'now':now.isoformat()},'config_revision':rev,'next_event':next_event,'last_outcome':s.store.recent(),'relay_health':health,'scheduler':{'last_scan':s.last_scan,'skipped_missed':s.skipped,'error':s.store.meta('last_error')}})
        return self.send(404,{'ok':False,'error':'not found'})
    def do_POST(self):
        if not self.auth():return self.send(401,{'ok':False,'error':'unauthorized'})
        try:
            d=self.body();store=self.server.scheduler.store
            if self.path=='/config':
                if set(d)!={'revision','config'}:raise ValueError('revision and config required')
                if not d['config'].get('paused') and os.environ.get('KENNEMER_BELL_LIVE')=='1':
                    for relay in RELAYS:relay_ready(relay)
                rev=store.set(d['revision'],d['config']);return self.send(200,{'ok':True,'revision':rev})
            if self.path in ('/pause','/resume','/restore'):
                rev,c=store.get()
                if d.get('revision')!=rev:raise Conflict()
                if self.path=='/restore':
                    backup=json.loads(store.path.with_suffix(store.path.suffix+'.bak').read_text())
                    c=backup['config'];c['paused']=True
                else:c['paused']=self.path=='/pause'
                if self.path=='/resume' and os.environ.get('KENNEMER_BELL_LIVE')=='1':
                    for relay in RELAYS:relay_ready(relay)
                nxt=store.set(rev,c);return self.send(200,{'ok':True,'revision':nxt,'config':c})
            if self.path=='/demo':
                rid=d.get('request_id');count=d.get('count',1)
                if not isinstance(rid,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',rid):raise ValueError('request_id required')
                key='demo/'+rid
                if not store.claim(key,'demo'):return self.send(200,{'ok':True,'duplicate':True,'outcome':store.event(key)})
                def run_demo():
                    try:out=fire(count,store.get()[1]['gap_seconds'],os.environ.get('KENNEMER_BELL_SIMULATION')=='1')
                    except Exception as exc:out={'ok':False,'error':str(exc)}
                    store.finish(key,out)
                threading.Thread(target=run_demo,daemon=True).start();return self.send(202,{'ok':True,'request_id':rid,'status':'running'})
            return self.send(404,{'ok':False,'error':'not found'})
        except Conflict:return self.send(409,{'ok':False,'error':'revision conflict'})
        except Exception as e:return self.send(400,{'ok':False,'error':str(e)[:240]})

def main():
    if os.environ.get('KENNEMER_BELL_SIMULATION')=='1' and os.environ.get('KENNEMER_BELL_LIVE')=='1':raise SystemExit('choose one mode')
    if os.environ.get('KENNEMER_BELL_SIMULATION')!='1' and os.environ.get('KENNEMER_BELL_LIVE')!='1':raise SystemExit('set explicit bell mode')
    token=os.environ.get(TOKEN_ENV)
    if not token:raise SystemExit('maintenance token required')
    lockpath=DB_PATH.with_suffix('.lock');lockpath.parent.mkdir(parents=True,exist_ok=True);lock=open(lockpath,'w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    srv=ThreadingHTTPServer((HOST,PORT),Handler);srv.scheduler=Scheduler();threading.Thread(target=srv.scheduler.loop,daemon=True).start();srv.serve_forever()
if __name__=='__main__':main()
