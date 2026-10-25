"""既存の標準実行環境で暗号化梱包を呼び出す。鍵は環境変数だけから取得。"""
from pathlib import Path
import subprocess
import sys

if len(sys.argv) != 4 or sys.argv[1] not in ('pack', 'unpack'):
    raise SystemExit('pack または unpack と入力・出力場所を指定してください。')
result = subprocess.run(['node', str(Path(__file__).with_name('bundle_crypto.mjs')), *sys.argv[1:]], check=False)
raise SystemExit(result.returncode)
