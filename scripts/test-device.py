"""Bench test for a spare/empty Toki queue. Requires bleak; --write-test replaces it."""
import argparse, asyncio, json, pathlib, time
from bleak import BleakScanner, BleakClient

COMMAND = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923002'
EVENT = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923003'
INFO = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923004'

async def main(args):
    target = await BleakScanner.find_device_by_filter(lambda d, a: (a.local_name or d.name or '').startswith('Toki'), timeout=20)
    if not target: raise RuntimeError('Toki not found; disconnect the phone first.')
    frames, timings = [], []
    def receive(_, data): frames.append(bytes(data).decode())
    async with BleakClient(target) as client:
        assert bytes(await client.read_gatt_char(INFO)).decode() == 'TOKI/3'
        await client.start_notify(EVENT, receive)
        async def request(command, expected):
            start, offset = time.monotonic(), len(frames)
            await client.write_gatt_char(COMMAND, command.encode(), response=True)
            while time.monotonic() - start < 7:
                new = frames[offset:]
                errors = [f for f in new if f.startswith('E:')]
                if errors: raise RuntimeError(errors[-1])
                if expected in new:
                    timings.append({'command': command, 'seconds': round(time.monotonic()-start,3)})
                    return new
                await asyncio.sleep(.025)
            raise TimeoutError(command + ' missing ' + expected)
        await request('H:1234abcd', 'A:1234abcd:3')
        initial = await request('R', 'K:R')
        if args.clear_bench:
            state = next(f for f in initial if f.startswith('V:')).split(':')
            ids = {f.split(':')[1] for f in initial if f.startswith('X:')}
            if state[1:3] != ['500', '2'] or ids != {'abcd0000', 'abcd0001'}:
                raise RuntimeError('Refusing to clear anything except this script\'s two bench tasks.')
            await request('u', 'K:u')
            await request('B:501:0', 'K:B:501')
            await request('E:501', 'K:E:501')
            await request('R', 'K:R')
        if args.write_test:
            state = next(f for f in initial if f.startswith('V:')).split(':')
            if state[2] != '0': raise RuntimeError('Refusing to replace a nonempty task queue.')
            await request('u', 'K:u')
            await request('B:500:2','K:B:500')
            for slot, title in enumerate(['OTA test','BLE test']):
                await request(f'T:{slot}:abcd000{slot}:0', f'K:T:{slot}')
                await request(f'S:{slot}:0', f'K:S:{slot}')
                await request(f'N:{slot}:0:{title}', f'K:N:{slot}:0')
            await request('E:500', 'K:E:500')
            # Ping/read must work while the display's full refresh is in progress.
            for i in range(10):
                await request(f'P:{i:08x}', f'Q:{i:08x}')
                await asyncio.sleep(.25)
            await request('Z:0:0','K:Z:0')
            await asyncio.sleep(2.2)
            await request('Y','K:Y')
            await request('Z:0:0','K:Z:0')
            await asyncio.sleep(1.1)
            await request('M:0','K:M:0')
            await request('R','K:R')
            assert 'V:500:2:0:1' in frames
            assert any(f.startswith('X:abcd0000:') and int(f.split(':')[-1]) >= 3 for f in frames)
        if args.ota:
            await request('U','K:U')
            response = await request('R','K:R')
            secrets = {f[:2]: f[3:] for f in response if f.startswith(('WN:','WP:','WI:'))}
            pathlib.Path('build/ota-device.json').write_text(json.dumps(secrets))
            print('OTA enabled; credentials saved privately under ignored build directory.')
        safe = [f for f in frames if not f.startswith('WP:')]
        result = {'frames': safe, 'timings':timings, 'maxReplySeconds':max(t['seconds'] for t in timings)}
        pathlib.Path('build/ble-test.json').write_text(json.dumps(result,indent=2))
        print(json.dumps({'passed': True, 'requests':len(timings), 'maxReplySeconds':result['maxReplySeconds'], 'state':[f for f in safe if f.startswith(('V:','X:','CB:','CF:'))][-10:]}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--write-test',action='store_true'); parser.add_argument('--ota',action='store_true'); parser.add_argument('--clear-bench',action='store_true')
    asyncio.run(main(parser.parse_args()))
