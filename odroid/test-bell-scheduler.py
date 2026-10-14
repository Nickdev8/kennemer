#!/usr/bin/env python3
import datetime as dt, json, os, socket, tempfile, threading, time, unittest
from pathlib import Path
from unittest.mock import patch
import bell_scheduler as b

class BellTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.defaults=Path(self.tmp.name)/'defaults.json'; self.defaults.write_text(json.dumps(json.loads((Path(__file__).parent/'bell-defaults.json').read_text())))
        self.cache=Path(self.tmp.name)/'ips.json';self.cache.write_text(json.dumps({'devices':{'a8032abc4264':{'ip':'10.10.80.162'},'08b61fd8993c':{'ip':'10.10.80.161'}}}))
        cache_patch=patch.object(b,'IP_CACHE_PATH',self.cache);cache_patch.start();self.addCleanup(cache_patch.stop)
        self.store=b.Store(Path(self.tmp.name)/'db.sqlite',self.defaults)
        self.scheduler=b.Scheduler(self.store)
        self.now=dt.datetime(2026,10,12,8,10,tzinfo=b.ZoneInfo(b.ZONE));self.scheduler.clock=lambda:self.now
        self.scheduler.synchronized=lambda:True
    def test_rosters_and_double(self):
        _,c=self.store.get();self.assertEqual(c['profiles']['regular'][0],'08:10x2');self.assertEqual(len(c['profiles']['ten-minute']),61)
        self.assertEqual(c['profiles']['ten-minute'][0],'14:00');self.assertEqual(c['profiles']['ten-minute'][-1],'16:00')
        c['paused']=False;self.store.set(1,c)
        self.assertEqual(self.scheduler.due()[0][1],2)
    def test_off_mode_has_no_due_bell(self):
        self.assertEqual(self.scheduler.due(),[])
        _,config=self.store.get()
        self.assertTrue(config['paused'])
    def test_weekends_and_ten_minute_active_profile(self):
        _,c=self.store.get();c['paused']=False;c['active_profile']='ten-minute';self.store.set(1,c)
        self.now=dt.datetime(2026,10,12,14,0,tzinfo=b.ZoneInfo(b.ZONE));self.assertEqual(self.scheduler.due()[0][0], '2026-10-12/ten-minute/14:00')
        self.now=dt.datetime(2026,10,12,14,2,tzinfo=b.ZoneInfo(b.ZONE));self.assertEqual(self.scheduler.due()[0][0], '2026-10-12/ten-minute/14:02')
        self.now=dt.datetime(2026,10,18,14,0,tzinfo=b.ZoneInfo(b.ZONE));self.assertEqual(self.scheduler.due(),[])
        c['weekdays'].append(6);self.store.set(2,c)
        self.assertEqual(self.scheduler.due()[0][0], '2026-10-18/ten-minute/14:00')
    def test_revision_conflict_backup_and_restore(self):
        _,c=self.store.get();c['gap_seconds']=2;self.assertEqual(self.store.set(1,c),2)
        with self.assertRaises(b.Conflict):self.store.set(1,c)
        self.assertTrue(Path(str(self.store.path)+'.bak').exists())
    def test_restart_deduplicates_claimed_event(self):
        self.assertTrue(self.store.claim('2026-10-12/regular/08:10','scheduled'))
        self.assertFalse(b.Store(self.store.path,self.defaults).claim('2026-10-12/regular/08:10','scheduled'))
    def test_partial_relay_failure_preserved(self):
        seq=iter([{'ok':True,'relay':'a'}, {'ok':False,'error':'timeout'}])
        with patch.object(b,'relay_ready',return_value={}),patch.object(b,'read_switch',return_value=True),patch.object(b,'rpc',return_value={}):
            # Verify sibling relay threads both attempt pulse and aggregate partial failure.
            with patch.object(b,'pulse',side_effect=lambda r,duration: next(seq)):
                result=b.fire(1,1)
        self.assertFalse(result['ok']);self.assertEqual(len(result['pulses'][0]['relays']),2)

    def test_configurable_pulse_matches_relay_auto_off(self):
        relay=b.RELAYS[0]
        with patch.object(b,'relay_ready') as ready,patch.object(b,'read_switch',side_effect=[True,False,True]),patch.object(b,'rpc') as rpc:
            self.assertTrue(b.pulse(relay,3)['ok'])
        ready.assert_called_once_with(relay,3)
        rpc.assert_called_once_with(relay,'Switch.Set',{'id':0,'on':True,'toggle_after':3})

    def test_duration_bounds_and_legacy_default(self):
        _,config=self.store.get();self.assertEqual(config['bell_duration_seconds'],1)
        config['bell_duration_seconds']=0
        with self.assertRaises(ValueError):self.store.set(1,config)
        config['bell_duration_seconds']=31
        with self.assertRaises(ValueError):self.store.set(1,config)
    def test_duration_save_updates_both_hardware_timers_without_pulsing(self):
        revision,config=self.store.get();config['bell_duration_seconds']=3
        calls=[]
        def rpc(relay,method,params=None):
            calls.append((relay['id'],method,params))
            if method=='Switch.GetConfig':return {'initial_state':'off','auto_off':True,'auto_off_delay':1}
            return {}
        with patch.dict(os.environ,{'KENNEMER_BELL_LIVE':'1'}),patch.object(b,'relay_check',return_value={'identity_ok':True}),patch.object(b,'read_switch',return_value=True),patch.object(b,'rpc',side_effect=rpc),patch.object(b,'relay_ready'):
            b.save_config(self.store,revision,config)
        writes=[call for call in calls if call[1]=='Switch.SetConfig']
        self.assertEqual(len(writes),2)
        self.assertTrue(all(call[2]['config']['auto_off_delay']==3 for call in writes))
        self.assertFalse(any(call[1]=='Switch.Set' for call in calls))
        self.assertTrue(self.store.get()[1]['paused'])
        self.assertEqual(self.store.get()[1]['bell_duration_seconds'],3)

    def test_failed_timer_update_rolls_back_and_preserves_roster(self):
        revision,config=self.store.get();config['bell_duration_seconds']=3
        calls=[]
        def rpc(relay,method,params=None):
            calls.append((relay['id'],method,params))
            if method=='Switch.GetConfig':return {'initial_state':'off','auto_off':True,'auto_off_delay':1}
            if relay==b.RELAYS[1] and method=='Switch.SetConfig' and params['config']['auto_off_delay']==3:raise b.BellError('unavailable')
            return {}
        with patch.dict(os.environ,{'KENNEMER_BELL_LIVE':'1'}),patch.object(b,'relay_check',return_value={'identity_ok':True}),patch.object(b,'read_switch',return_value=True),patch.object(b,'rpc',side_effect=rpc),patch.object(b,'relay_ready'):
            with self.assertRaises(b.BellError):b.save_config(self.store,revision,config)
        self.assertEqual(self.store.get()[0],revision)
        self.assertEqual(self.store.get()[1]['bell_duration_seconds'],1)
        restored=[call for call in calls if call[1]=='Switch.SetConfig' and call[2]['config']['auto_off_delay']==1]
        self.assertEqual(len(restored),2)

    def test_relay_identity_and_address_validation(self):
        _,config=self.store.get()
        config['relays'][0]['id']='invalid'
        with self.assertRaises(ValueError):b.validate(config)
        config['relays']=list(b.RELAYS);config['relays'][1]=dict(config['relays'][0])
        with self.assertRaises(ValueError):b.validate(config)

    def test_relay_address_follows_cache_changes(self):
        self.assertEqual(b.relay_ip('a8032abc4264'),'10.10.80.162')
        self.cache.write_text(json.dumps({'devices':{'a8032abc4264':{'ip':'10.10.80.200'}}}))
        self.assertEqual(b.relay_ip('a8032abc4264'),'10.10.80.200')
        self.cache.write_text(json.dumps({'devices':{'a8032abc4264':{'ip':'127.0.0.1'}}}))
        with self.assertRaises(b.BellError):b.relay_ip('a8032abc4264')

    def test_legacy_relay_ips_are_removed_from_saved_config(self):
        revision,config=self.store.get();config['relays'][0]['ip']='10.10.80.1'
        self.store.set(revision,config)
        self.assertEqual(self.store.get()[1]['relays'][0],{'id':'a8032abc4264'})

    def test_clock_resynchronization_does_not_disable_future_bells(self):
        _,config=self.store.get();config['paused']=False;self.store.set(1,config)
        self.scheduler.started_at=dt.datetime(2030,1,1,tzinfo=b.ZoneInfo(b.ZONE)).timestamp()
        self.scheduler.prev_wall=self.now.timestamp()+1000
        self.scheduler.prev_mono=time.monotonic()-1
        self.scheduler.tick()
        self.assertIsNone(self.scheduler.started_at)
        self.scheduler.suppress_until=0
        self.scheduler.prev_wall=None
        self.now=dt.datetime(2026,10,12,8,10,5,tzinfo=b.ZoneInfo(b.ZONE))
        with patch.object(b,'fire') as fired:
            self.scheduler.tick()
            fired.assert_not_called()
        self.assertEqual(self.scheduler.store.recent()['status'],'failed')
        self.scheduler.prev_wall=None
        self.now=dt.datetime(2026,10,12,8,15,tzinfo=b.ZoneInfo(b.ZONE))
        with patch.object(b,'fire',return_value={'ok':True}) as fired:
            self.scheduler.tick()
            fired.assert_called_once()
    def test_next_event_uses_time_order_after_edit(self):
        _,config=self.store.get();config['paused']=False;config['profiles']['regular']=['09:05','08:15']
        self.store.set(1,config)
        self.now=dt.datetime(2026,10,12,8,0,tzinfo=b.ZoneInfo(b.ZONE))
        self.assertEqual(self.scheduler.next_event()['time'],'08:15')

    def test_next_event_reports_double_for_both_entry_formats(self):
        self.now=dt.datetime(2026,10,12,8,0,tzinfo=b.ZoneInfo(b.ZONE))
        for entry in ['08:10x2', {'time':'08:10','count':2}]:
            revision,config=self.store.get();config['paused']=False;config['profiles']['regular']=[entry]
            self.store.set(revision,config)
            self.assertEqual(self.scheduler.next_event()['count'],2)
    def test_clock_jump_skips_scan(self):
        self.scheduler.prev_wall=self.now.timestamp()-10;self.scheduler.prev_mono=time.monotonic()-1
        self.scheduler.tick();self.assertEqual(self.scheduler.skipped,1)
    def test_dst_fold_uses_local_schedule_once(self):
        # Both UTC instants map to same local 02:30 during autumn fold; durable key allows one claim.
        c=self.store.defaults();c['paused']=False;c['profiles']['regular']=['02:30'];self.store.set(1,c)
        first=dt.datetime(2026,10,25,0,30,tzinfo=dt.timezone.utc).astimezone(b.ZoneInfo(b.ZONE))
        second=dt.datetime(2026,10,25,1,30,tzinfo=dt.timezone.utc).astimezone(b.ZoneInfo(b.ZONE))
        self.assertEqual(first.hour,2);self.assertEqual(second.hour,2)
        self.assertTrue(self.store.claim('2026-10-25/regular/02:30','scheduled'));self.assertFalse(self.store.claim('2026-10-25/regular/02:30','scheduled'))
    def test_timeout_is_reported_without_retry(self):
        calls=[]
        def timeout(*a,**kw):calls.append(1);raise socket.timeout()
        with patch.object(b,'urlopen',timeout):
            with self.assertRaises(b.BellError):b.rpc(b.RELAYS[0],'Shelly.GetDeviceInfo')
        self.assertEqual(len(calls),1)
    def test_simulated_double_reports_both_relays(self):
        result=b.fire(2,0,simulation=True)
        self.assertEqual(len(result['pulses']),2)
        self.assertTrue(all(len(pulse['relays'])==2 for pulse in result['pulses']))
    def test_rpc_envelope_and_identity(self):
        from io import BytesIO
        class Reply:
            status=200
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,*args):return json.dumps({'id':1,'result':{'id':'shellyplus1-a8032abc4264','model':'SNSW-001X16EU','gen':2}}).encode()
        with patch.object(b,'urlopen',return_value=Reply()) as mocked:
            result=b.rpc(b.RELAYS[0],'Shelly.GetDeviceInfo')
            request=mocked.call_args.args[0]
            self.assertEqual(request.full_url,'http://10.10.80.162/rpc')
            self.assertEqual(json.loads(request.data)['method'],'Shelly.GetDeviceInfo')
            self.assertEqual(result['gen'],2)
        with patch.object(b,'rpc',side_effect=[result,{'initial_state':'off','auto_off':True,'auto_off_delay':1}]):
            self.assertTrue(b.relay_ready(b.RELAYS[0])['identity_ok'])
    def test_startup_does_not_replay_recent_bell(self):
        _,c=self.store.get();c['paused']=False;self.store.set(1,c)
        self.scheduler.started_at=self.now.timestamp()+5
        with patch.object(b,'fire') as fired:
            self.scheduler.tick();fired.assert_not_called()
        self.assertEqual(self.store.recent()['status'],'failed')
    def test_claim_and_demo_id_deduplicate(self):
        self.assertTrue(self.store.claim('demo/id','demo'));self.assertFalse(self.store.claim('demo/id','demo'))
        self.store.finish('demo/id',{'ok':False,'error':'partial relay timeout'})
        self.assertEqual(self.store.event('demo/id')['status'],'failed')

if __name__=='__main__':unittest.main()
