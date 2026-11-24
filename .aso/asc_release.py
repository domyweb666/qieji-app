# 茄記改版送審工具（照豆鍵 .aso/asc_release.py 搬）。在 GitHub Actions 跑（.github/workflows/asc-release.yml），金鑰用 repo secrets。
# python -I .aso/asc_release.py status   只讀：版本、build、內購、語系、審查中的提交單
# 不印審查聯絡資料（這個 repo 的紀錄是公開的）
import os
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")
API = "https://api.appstoreconnect.apple.com/v1"
BUNDLE_ID = "org.domyweb.qieji"


class ASC:
    def __init__(self):
        import jwt
        import requests
        self.r = requests
        tok = jwt.encode(
            {"iss": os.environ["ASC_ISSUER_ID"], "iat": int(time.time()), "exp": int(time.time()) + 1200,
             "aud": "appstoreconnect-v1"},
            os.environ["ASC_PRIVATE_KEY"], algorithm="ES256",
            headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"},
        )
        self.h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    def call(self, method, path, body=None):
        res = self.r.request(method, API + path, headers=self.h, json=body, timeout=60)
        if res.status_code >= 400:
            print(f"!! {method} {path} → {res.status_code}\n{res.text[:1500]}")
            sys.exit(1)
        return res.json() if res.text else {}


def vstate(v):
    a = v["attributes"]
    return a.get("appVersionState") or a.get("appStoreState")


def status(asc, app_id):
    vs = asc.call("GET", f"/apps/{app_id}/appStoreVersions?filter[platform]=IOS&limit=20")["data"]
    for v in vs:
        a = v["attributes"]
        print(f"版本 {a['versionString']}：{vstate(v)}｜發行 {a.get('releaseType')}｜建立 {a.get('createdDate')}")
        for loc in asc.call("GET", f"/appStoreVersions/{v['id']}/appStoreVersionLocalizations")["data"]:
            t = loc["attributes"]
            print(f"  語系 {t['locale']}｜描述 {len(t.get('description') or '')} 字｜新功能 {len(t.get('whatsNew') or '')} 字"
                  f"｜宣傳 {len(t.get('promotionalText') or '')} 字")
            print(f"  宣傳文字：{t.get('promotionalText')}")
            print(f"  描述：{t.get('description')}")
        detail = asc.call("GET", f"/appStoreVersions/{v['id']}/appStoreReviewDetail").get("data")
        if detail:
            print(f"  審查備註 {len((detail['attributes'].get('notes') or '').encode())} bytes")
    for b in asc.call("GET", f"/builds?filter[app]={app_id}&sort=-uploadedDate&limit=5")["data"]:
        a = b["attributes"]
        print(f"build {a['version']}：{a['processingState']}｜上傳 {a['uploadedDate']}｜過期 {a['expired']}｜加密問題已答 {a['usesNonExemptEncryption'] is not None}")
    for x in asc.call("GET", f"/apps/{app_id}/inAppPurchasesV2?limit=20")["data"]:
        print(f"內購 {x['attributes']['productId']}：{x['attributes']['state']}")
    for s in asc.call("GET", f"/reviewSubmissions?filter[app]={app_id}&filter[platform]=IOS&limit=10")["data"]:
        print(f"提交單：{s['attributes'].get('state')}｜{s['attributes'].get('submittedDate')}")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "status"
    if mode != "status":
        sys.exit(f"不認得的模式：{mode}")
    asc = ASC()
    apps = asc.call("GET", f"/apps?filter[bundleId]={BUNDLE_ID}")["data"]
    if not apps:
        sys.exit("找不到 app")
    status(asc, apps[0]["id"])


main()
