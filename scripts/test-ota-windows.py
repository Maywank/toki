"""Local Wi-Fi OTA bench test; restores the laptop's previous Wi-Fi profile."""
import json, pathlib, re, subprocess, time, threading, argparse
from xml.sax.saxutils import escape
import requests

def netsh(*args):
    result = subprocess.run(['netsh','wlan',*args],capture_output=True,text=True,check=True)
    return result.stdout

parser = argparse.ArgumentParser()
parser.add_argument("--already-enabled",action="store_true")
parser.add_argument("--serial-port", help="Optional USB port for extra diagnostics; wireless updates do not need it")
parser.add_argument("--wait-before-upload", type=float, default=0, help="Seconds to leave the page open before starting the upload")
parser.add_argument("--probe-only", action="store_true", help="Verify a delayed upload accepts its first chunk, then abort without installing")
options = parser.parse_args()
credentials = json.loads(pathlib.Path('build/ota-device.json').read_text())
ssid, password = credentials['WN'], credentials['WP']
current = netsh('show','interfaces')
match = re.search(r'^\s*Profile\s*:\s*(.+)$',current,re.M)
previous = match.group(1).strip() if match else None
profile = pathlib.Path('build/ota-wifi-profile.xml')
profile.write_text(f'''<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>{escape(ssid)}</name><SSIDConfig><SSID><name>{escape(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>{escape(password)}</keyMaterial></sharedKey></security></MSM></WLANProfile>''')
http = requests.Session(); http.trust_env = False; http.headers["Connection"] = "close"
base = 'http://192.168.4.1'
auth = ('toki',password)
def join():
    netsh('connect',f'name={ssid}')
    for _ in range(25):
        try:
            r = http.get(base+'/health',auth=auth,timeout=2)
            if r.status_code == 200: return r.json()
        except requests.RequestException: pass
        time.sleep(1)
    raise RuntimeError('Could not reach Toki Wi-Fi')

try:
    if options.serial_port:
        import serial
        console = serial.Serial(port=None, baudrate=115200, timeout=.2)
        console.dtr = False; console.rts = False; console.port = options.serial_port; console.open()
        serial_data = bytearray(); stop = threading.Event()
        def capture():
            while not stop.is_set(): serial_data.extend(console.read(console.in_waiting or 1))
        worker = threading.Thread(target=capture); worker.start()
        time.sleep(3)
    if not options.already_enabled: subprocess.run(['python','scripts/test-device.py','--ota'],check=True)
    netsh('add','profile',f'filename={profile.resolve()}','user=current')
    before = join(); print('Before OTA:',json.dumps(before),flush=True)
    assert http.get(base+'/health',timeout=3).status_code == 401
    bad = http.post(base+'/update?size=8',files={'firmware':('invalid.bin',b'badimage')},auth=auth,timeout=10)
    assert bad.status_code == 400, bad.text
    assert http.get(base+'/health',auth=auth,timeout=3).json() == before
    print('Unauthenticated access and invalid firmware rejected.',flush=True)
    image = pathlib.Path('build/toki/Toki.ino.bin').read_bytes()
    expected_version = re.search(r'FIRMWARE_VERSION\[\] = "([^"]+)"', pathlib.Path('firmware/Toki/Ota.h').read_text()).group(1)
    if options.wait_before_upload:
        print('Leaving update page open for', options.wait_before_upload, 'seconds.',flush=True)
        time.sleep(options.wait_before_upload)
    start = time.monotonic()
    ready = http.post(base+f'/update/start?size={len(image)}',auth=auth,timeout=30)
    assert ready.status_code == 200, ready.text
    time.sleep(.5)
    for offset in range(0,len(image),4096):
        part = http.post(base+f'/update/chunk?offset={offset}',data=image[offset:offset+4096].hex(),headers={'Content-Type':'text/plain'},auth=auth,timeout=30)
        assert part.status_code == 200, part.text
        if options.probe_only:
            # Deliberately incomplete: finish must reject it without changing the boot image.
            assert http.post(base+'/update/finish',auth=auth,timeout=5).status_code == 400
            assert http.get(base+'/health',auth=auth,timeout=5).json() == before
            assert http.post(base+'/close',auth=auth,timeout=5).status_code == 200
            print('DELAYED START VERIFIED; partial upload rejected, installed firmware unchanged.',flush=True)
            raise SystemExit(0)
        time.sleep(.05)
        if offset % 65536 == 0: print("Uploaded",offset+4096,"bytes",flush=True)
    uploaded = http.post(base+'/update/finish',auth=auth,timeout=30)
    assert uploaded.status_code == 200, uploaded.text
    print('Wireless upload accepted in',round(time.monotonic()-start,2),'seconds.',flush=True)
    time.sleep(6)
    subprocess.run(['python','scripts/test-device.py','--ota'],check=True)
    after = join()
    assert before['partition'] != after['partition'], (before, after)
    assert after['version'] == expected_version, after
    assert http.get(base+'/logs',auth=auth,timeout=3).status_code == 200
    result = {'passed':True,'before':before,'after':after,'uploadSeconds':round(time.monotonic()-start,2),'invalidImageRejected':True,'authenticationRequired':True,'usbSerialUsed':bool(options.serial_port),'waitBeforeUploadSeconds':options.wait_before_upload}
    pathlib.Path('build/ota-test.json').write_text(json.dumps(result,indent=2))
    print('OTA VERIFIED:',json.dumps(result),flush=True)
    closed = http.post(base+'/close',auth=auth,timeout=5)
    assert closed.status_code == 200, closed.text
    time.sleep(3)
except Exception:
    print('Still on Toki Wi-Fi:', f'SSID                   : {ssid}' in netsh('show','interfaces'),flush=True)
    try: print('Device health after failure:',http.get(base+'/health',auth=auth,timeout=3).status_code,flush=True)
    except Exception as error: print('Health read failed:',type(error).__name__,flush=True)
    try:
        http.post(base+'/update/finish',auth=auth,timeout=5)
        http.post(base+'/close',auth=auth,timeout=5)
    except requests.RequestException: pass
    time.sleep(3)
    raise
finally:
    if previous: netsh('connect',f'name={previous}')
    profile.unlink(missing_ok=True)
    netsh('delete','profile',f'name={ssid}')
    if 'console' in globals():
        stop.set(); worker.join(); console.close()
        text = serial_data.decode(errors='replace').replace(password,'[hidden]')
        pathlib.Path('build/ota-serial.txt').write_text(text)
        print('Serial diagnostics:',text[-3500:],flush=True)
    print('Previous laptop Wi-Fi restored.',flush=True)
