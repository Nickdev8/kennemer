#!/usr/bin/env python3
"""Durable, fail-closed Shelly bell scheduler and authenticated local API."""
import ipaddress
import copy, datetime as dt, fcntl, json, os, re, sqlite3, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from urllib.error import URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

HOST=os.environ.get('KENNEMER_BELL_HOST','0.0.0.0'); PORT=int(os.environ.get('KENNEMER_BELL_PORT','8788')); TOKEN_ENV='KENNEMER_MAINTENANCE_TOKEN'
RELAYS=({'id':'a8032abc4264'}, {'id':'08b61fd8993c'})
PROFILES=('regular','short','ten-minute'); ZONE='Europe/Amsterdam'; TIMEOUT=2.5
BASE=Path(__file__).resolve().parent
DB_PATH=Path(os.environ.get('KENNEMER_BELL_DB','/var/lib/kennemer/bell/bell.sqlite3'))
DEFAULTS_PATH=Path(os.environ.get('KENNEMER_BELL_DEFAULTS',str(BASE/'bell-defaults.json')))
IP_CACHE_PATH=Path(os.environ.get('KENNEMER_BELL_IP_CACHE',str(BASE.parent/'runtime/ips.json')))

class BellError(Exception): pass

def validate_relay(relay):
    if not isinstance(relay,dict) or set(relay)!={'id'} or not re.fullmatch(r'[0-9a-f]{12}',relay.get('id','')): raise ValueError('invalid relay identity')

def relay_ip(device_id):
    try:
        cache=json.loads(IP_CACHE_PATH.read_text())
        devices=cache.get('devices',cache)
        if isinstance(devices,list):entry=next((device for device in devices if str(device.get('id','')).lower()==device_id),None)
        else:entry=next((device for key,device in devices.items() if key.lower()==device_id or isinstance(device,dict) and str(device.get('id','')).lower()==device_id),None)
        ip=entry if isinstance(entry,str) else next((entry.get(key) for key in ('ip','local_ip','lan_ip','address') if entry.get(key)),None) if isinstance(entry,dict) else None
        address=ipaddress.ip_address(ip)
        if address.version!=4 or not address.is_private or address.is_loopback or address.is_multicast or address.is_unspecified:raise ValueError('invalid LAN address')
        return str(address)
    except (OSError,ValueError,TypeError,AttributeError) as error:raise BellError('Geen geldig LAN-adres in apparaatcache voor '+device_id) from error


def rpc(relay, method, params=None):
    validate_relay(relay)
    url='http://%s/rpc' % relay_ip(relay['id'])
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

def relay_ready(relay, bell_duration_seconds=1):
    h=relay_check(relay)
    if not h['identity_ok'] or not h['initial_state_off']:
        raise BellError('relay not commissioned: '+relay['id'])
    if h['auto_off_seconds'] != bell_duration_seconds:
        raise BellError('Stel auto-off van relais %s in op %s seconde(n).' % (relay['id'],bell_duration_seconds))
    return h

def read_switch(relay):
    d=rpc(relay,'Switch.GetStatus',{'id':0}); return d.get('output') is False

def prepare_pulse(relay, duration, trace):
    trace['preflight_started_at']=utcnow()
    relay_ready(relay,duration)
    if not read_switch(relay): raise BellError('relay is not off before pulse')
    trace['ready_at']=utcnow()


def pulse(relay, bell_duration_seconds=1, not_before=None, prepared=False, trace=None):
    trace=trace if trace is not None else {}
    if not prepared:prepare_pulse(relay,bell_duration_seconds,trace)
    if not_before is not None:time.sleep(max(0,not_before-time.monotonic()))
    trace['command_sent_at']=utcnow()
    trace['command_sent_monotonic']=time.monotonic()
    rpc(relay,'Switch.Set',{'id':0,'on':True,'toggle_after':bell_duration_seconds})
    trace['command_acknowledged_at']=utcnow()
    deadline=time.monotonic()+bell_duration_seconds+TIMEOUT+.5; saw_on=False
    while time.monotonic()<deadline:
        off=read_switch(relay)
        if not off:
            if not saw_on:trace['on_observed_at']=utcnow()
            saw_on=True
        elif saw_on:
            trace['off_observed_at']=utcnow()
            return {'ok':True,'relay':relay['id'],**trace}
        time.sleep(min(.1,bell_duration_seconds/5))
    raise BellError('relay pulse did not complete on then off')

_sequence_lock=threading.Lock()
def fire(count,gap,simulation=False,bell_duration_seconds=1,relays=None):
    relays=relays or RELAYS
    if count not in (1,2): raise BellError('count must be one or two')
    if not _sequence_lock.acquire(blocking=False): return {'ok':False,'error':'bell sequence already active'}
    outcomes=[]; not_before=None
    try:
      for i in range(count):
        if simulation: result={'ok':True,'simulated':True,'relays':[{'ok':True,'relay':r['id'],'simulated':True} for r in relays]}
        else:
            out=[None for _ in relays]; traces=[{} for _ in relays]
            def prepare(j,relay):
                try:prepare_pulse(relay,bell_duration_seconds,traces[j])
                except Exception as exc:out[j]={'ok':False,'relay':relay['id'],'error':str(exc),'failed_at':utcnow(),**traces[j]}
            if i==0:
                checks=[threading.Thread(target=prepare,args=(j,r),daemon=True) for j,r in enumerate(relays)]
                [t.start() for t in checks]; [t.join() for t in checks]
            else:
                # First-pulse success already verifies both outputs returned off.
                traces=[{'preflight_reused_from_pulse':1} for _ in relays]
            # Complete initial preflight before releasing any ON request. A failed
            # relay never starts late; healthy siblings still provide redundancy.
            start=threading.Event()
            def run(j,relay):
                start.wait()
                try:out[j]=pulse(relay,bell_duration_seconds,prepared=True,trace=traces[j])
                except Exception as exc:out[j]={'ok':False,'relay':relay['id'],'error':str(exc),'failed_at':utcnow(),**traces[j]}
            workers=[threading.Thread(target=run,args=(j,r),daemon=True) for j,r in enumerate(relays) if out[j] is None]
            [t.start() for t in workers]
            if not_before is not None:time.sleep(max(0,not_before-time.monotonic()))
            start.set()
            [t.join() for t in workers]
            sent=[x.pop('command_sent_monotonic') for x in out if 'command_sent_monotonic' in x]
            result={'ok':all(x.get('ok') for x in out),'relays':out,
                    'command_dispatch_skew_ms':round((max(sent)-min(sent))*1000,3) if len(sent)>1 else None}
        outcomes.append(result)
        if not result['ok']: break
        if i+1<count:
            if simulation: time.sleep(gap)
            else: not_before=time.monotonic()+gap
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
        body.setdefault('bell_duration_seconds',1)
        body.setdefault('relays',copy.deepcopy(list(RELAYS)))
        body['relays']=[{'id':relay['id']} for relay in body['relays']]
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
    if not isinstance(c.get('paused'),bool) or not isinstance(c.get('weekdays'),list) or not c['weekdays'] or len(set(c['weekdays']))!=len(c['weekdays']) or any(type(x)!=int or x not in range(7) for x in c['weekdays']):raise ValueError('invalid schedule')
    gap=c.get('gap_seconds');
    if type(gap) not in (int,float) or not 0<=gap<=30:raise ValueError('gap_seconds out of range')
    relays=c.setdefault('relays',copy.deepcopy(list(RELAYS)))
    if not isinstance(relays,list) or len(relays)!=2 or len({r.get('id') for r in relays if isinstance(r,dict)})!=2: raise ValueError('two distinct bell relays required')
    for index,relay in enumerate(relays):
        if isinstance(relay,dict) and set(relay)<={'id','ip'}:relays[index]={'id':relay.get('id')}
        validate_relay(relays[index])
    duration=c.setdefault('bell_duration_seconds',1)
    if type(duration) not in (int,float) or not .1<=duration<=30:raise ValueError('bell_duration_seconds out of range')
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
        if date.weekday() not in c['weekdays']:return []
        prof=c['active_profile']
        result=[]
        for ent in c['profiles'][prof]:
            if isinstance(ent,str):
                m=re.fullmatch(r'(\d\d:\d\d)(?:x([12]))?',ent); stamp=m.group(1); count=int(m.group(2) or 1)
            else:stamp=ent['time'];count=ent.get('count',1)
            hour,minute=map(int,stamp.split(':')); target=dt.datetime.combine(date,dt.time(hour,minute),ZoneInfo(ZONE)); age=(now-target).total_seconds()
            if 0<=age<=30:result.append((f'{ds}/{prof}/{stamp}',count,c['gap_seconds'],c['bell_duration_seconds']))
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
        for key,count,gap,duration in self.due(now):
            if self.store.claim(key,'scheduled'):
                scheduled_date,_,scheduled_time=key.split('/')
                scheduled_at=dt.datetime.fromisoformat(scheduled_date+'T'+scheduled_time).replace(tzinfo=ZoneInfo(ZONE)).timestamp()
                if scheduled_at < self.started_at:
                    self.store.finish(key,{'ok':False,'skipped':'service started after scheduled time'});self.skipped+=1;continue
                out=fire(count,gap,simulation=os.environ.get('KENNEMER_BELL_SIMULATION')=='1',bell_duration_seconds=duration,relays=self.store.get()[1]['relays']);self.store.finish(key,out)
    def next_event(self,now=None):
        now=now or self.now(); _,c=self.store.get()
        if c['paused']:return None
        upcoming=[]
        for advance in range(8):
            day=now.date()+dt.timedelta(days=advance)
            if day.weekday() not in c['weekdays']:continue
            profile=c['active_profile']
            for entry in c['profiles'][profile]:
                stamp=(entry if isinstance(entry,str) else entry['time']).split('x')[0]
                count=int(entry.split('x')[1]) if isinstance(entry,str) and 'x' in entry else (entry.get('count',1) if isinstance(entry,dict) else 1)
                hour,minute=map(int,stamp.split(':'))
                target=dt.datetime.combine(day,dt.time(hour,minute),ZoneInfo(ZONE))
                if target>now:upcoming.append((target,{'at':target.isoformat(),'profile':profile,'time':stamp,'count':count}))
        return min(upcoming,key=lambda event:event[0])[1] if upcoming else None
    def loop(self):
        while True:
            try:self.tick()
            except Exception as e:self.store.meta('last_error',str(e)[:240])
            time.sleep(.5)

def save_config(store, revision, config):
    candidate=copy.deepcopy(config)
    validate(candidate)
    with store.lock:
        current_revision,current=store.get()
        if revision!=current_revision:raise Conflict()
        if os.environ.get('KENNEMER_BELL_LIVE')!='1':return store.set(revision,candidate)
        if not _sequence_lock.acquire(blocking=False):raise BellError('Wacht tot de huidige bel klaar is.')
        originals=[]
        changed=[]
        try:
            changed_timing=candidate['bell_duration_seconds']!=current['bell_duration_seconds'] or candidate['relays']!=current['relays']
            if changed_timing:
                for relay in candidate['relays']:
                    health=relay_check(relay)
                    if not health['identity_ok'] or not read_switch(relay):raise BellError('Relais-identiteit of uitstand kon niet worden bevestigd.')
                    previous=rpc(relay,'Switch.GetConfig',{'id':0})
                    originals.append((relay,{key:previous[key] for key in ('initial_state','auto_off','auto_off_delay')}))
                for relay,previous in originals:
                    changed.append((relay,previous))
                    rpc(relay,'Switch.SetConfig',{'id':0,'config':{'initial_state':'off','auto_off':True,'auto_off_delay':candidate['bell_duration_seconds']}})
                    relay_ready(relay,candidate['bell_duration_seconds'])
            elif not candidate['paused']:
                for relay in candidate['relays']:relay_ready(relay,candidate['bell_duration_seconds'])
            return store.set(revision,candidate)
        except Exception:
            for relay,previous in reversed(changed):
                try:rpc(relay,'Switch.SetConfig',{'id':0,'config':previous})
                except Exception:store.meta('last_error','Relay timer rollback failed: '+relay['id'])
            raise
        finally:_sequence_lock.release()


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
                    return {'id':relay['id'],'reachable':True,'identity_ok':True,'initial_state_off':True,'auto_off_seconds':c['bell_duration_seconds'],'output_off':True,'simulated':True}
                try:
                    item=relay_check(relay);item['output_off']=read_switch(relay);return item
                except Exception as e:return {'id':relay['id'],'reachable':False,'error':str(e)}
            with ThreadPoolExecutor(max_workers=2) as pool:health=list(pool.map(check_health,c['relays']))
            now=s.now(); next_event=s.next_event(now)
            return self.send(200,{'ok':True,'paused':c['paused'],'enabled':not c['paused'],'active_profile':c['active_profile'],'simulation':os.environ.get('KENNEMER_BELL_SIMULATION')=='1','bell_duration_seconds':c['bell_duration_seconds'],'clock':{'synchronized':s.synchronized(),'timezone':ZONE,'now':now.isoformat()},'config_revision':rev,'next_event':next_event,'last_outcome':s.store.recent(),'relay_health':health,'scheduler':{'last_scan':s.last_scan,'skipped_missed':s.skipped,'error':s.store.meta('last_error')}})
        return self.send(404,{'ok':False,'error':'not found'})
    def do_POST(self):
        if not self.auth():return self.send(401,{'ok':False,'error':'unauthorized'})
        try:
            d=self.body();store=self.server.scheduler.store
            if self.path=='/config':
                if set(d)!={'revision','config'}:raise ValueError('revision and config required')
                rev=save_config(store,d['revision'],d['config']);return self.send(200,{'ok':True,'revision':rev})
            if self.path in ('/pause','/resume','/restore'):
                rev,c=store.get()
                if d.get('revision')!=rev:raise Conflict()
                if self.path=='/restore':
                    backup=json.loads(store.path.with_suffix(store.path.suffix+'.bak').read_text())
                    restored=backup['config']
                    restored['paused']=c['paused']
                    restored['active_profile']=c['active_profile']
                    c=restored
                else:c['paused']=self.path=='/pause'
                nxt=save_config(store,rev,c);return self.send(200,{'ok':True,'revision':nxt,'config':c})
            if self.path=='/demo':
                rid=d.get('request_id');count=d.get('count',1)
                if not isinstance(rid,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',rid):raise ValueError('request_id required')
                key='demo/'+rid
                if not store.claim(key,'demo'):return self.send(200,{'ok':True,'duplicate':True,'outcome':store.event(key)})
                def run_demo():
                    try:
                        _,config=store.get()
                        out=fire(count,config['gap_seconds'],simulation=os.environ.get('KENNEMER_BELL_SIMULATION')=='1',bell_duration_seconds=config['bell_duration_seconds'],relays=config['relays'])
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
