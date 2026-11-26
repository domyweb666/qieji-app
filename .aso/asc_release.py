# 茄記改版送審工具（照豆鍵 .aso/asc_release.py 搬）。在 GitHub Actions 跑（.github/workflows/asc-release.yml），金鑰用 repo secrets。
# python -I .aso/asc_release.py status   只讀：版本、build、內購、語系、審查中的提交單
# python -I .aso/asc_release.py write        建草稿、寫新功能說明／宣傳文字／審查備註，讀回比對。不選 build、不送審
# python -I .aso/asc_release.py submit 207   先做 write，全對才選 build、提交審查
# 不動描述、名稱、副標、關鍵字、截圖；草稿的這些跟線上版對不上就停。文字從 SHEET 的三個程式碼區塊讀
# 不印審查聯絡資料（這個 repo 的紀錄是公開的）
import os
import re
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
API = "https://api.appstoreconnect.apple.com/v1"
BUNDLE_ID = "org.domyweb.qieji"
VERSION = "2.1.0"
LOCALE = "zh-Hant"
RELEASE = "AFTER_APPROVAL"  # 多米 2026-11-24 替 2.0.0 選：審過馬上全部發；2.1.0 沿用，送前再問一次
SHEET = Path(__file__).resolve().parent.parent / ".vibe" / "送審貼上版-2.1.0.md"
EDITABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"}
LIVE = {"READY_FOR_SALE", "READY_FOR_DISTRIBUTION"}
REVIEW_FIELDS = ("contactFirstName", "contactLastName", "contactPhone", "contactEmail",
                 "demoAccountName", "demoAccountPassword", "demoAccountRequired")


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


def texts():
    raw = SHEET.read_text(encoding="utf-8").replace("\r\n", "\n")
    found = [x.strip() for x in re.findall(r"```\n(.*?)```", raw, re.S)]
    if len(found) != 3:
        sys.exit(f"送審稿應該有 3 個程式碼區塊，找到 {len(found)} 個。停。")
    notes, promo, review = found
    for name, text in (("新功能說明", notes), ("宣傳文字", promo), ("審查備註", review)):
        if "待多米" in text:
            sys.exit(f"{name}還有「待多米」的字，還沒定稿。停。")
    if len(notes) > 4000 or len(promo) > 170 or len(review.encode()) > 4000:
        sys.exit(f"超過上限：新功能 {len(notes)}、宣傳 {len(promo)}、備註 {len(review.encode())} bytes。停。")
    return notes, promo, review


def localization(asc, version_id):
    found = asc.call("GET", f"/appStoreVersions/{version_id}/appStoreVersionLocalizations")["data"]
    return next(x for x in found if x["attributes"]["locale"] == LOCALE)


def shots(asc, loc_id):
    total = 0
    for x in asc.call("GET", f"/appStoreVersionLocalizations/{loc_id}/appScreenshotSets")["data"]:
        total += len(asc.call("GET", f"/appScreenshotSets/{x['id']}/appScreenshots?limit=50")["data"])
    return total


def write(asc, app_id):
    notes, promo, review = texts()
    vs = asc.call("GET", f"/apps/{app_id}/appStoreVersions?filter[platform]=IOS&limit=20")["data"]
    live = max((v for v in vs if vstate(v) in LIVE), key=lambda v: v["attributes"]["createdDate"])
    print(f"線上：{live['attributes']['versionString']}")
    mine = [v for v in vs if v["attributes"]["versionString"] == VERSION]
    if mine and vstate(mine[0]) not in EDITABLE:
        sys.exit(f"{VERSION} 現在是 {vstate(mine[0])}，不能改。停。")
    if not mine and any(vstate(v) in EDITABLE for v in vs):
        sys.exit("後台有別的準備中版本。停。")
    if mine:
        vid = mine[0]["id"]
    else:
        vid = asc.call("POST", "/appStoreVersions", {"data": {
            "type": "appStoreVersions",
            "attributes": {"platform": "IOS", "versionString": VERSION, "releaseType": RELEASE},
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})["data"]["id"]
        print(f"建了 {VERSION} 草稿")
    old, loc = localization(asc, live["id"])["attributes"], localization(asc, vid)
    for key in ("description", "keywords", "supportUrl", "marketingUrl"):
        if loc["attributes"].get(key) != old.get(key):
            sys.exit(f"{key} 跟線上版不一樣。停。")
    before, now = shots(asc, localization(asc, live["id"])["id"]), shots(asc, loc["id"])
    print(f"截圖：線上 {before} 張、草稿 {now} 張")
    if before != now:
        sys.exit("截圖張數不一樣。停。")
    asc.call("PATCH", f"/appStoreVersions/{vid}", {"data": {
        "type": "appStoreVersions", "id": vid, "attributes": {"releaseType": RELEASE}}})
    asc.call("PATCH", f"/appStoreVersionLocalizations/{loc['id']}", {"data": {
        "type": "appStoreVersionLocalizations", "id": loc["id"],
        "attributes": {"whatsNew": notes, "promotionalText": promo}}})
    prev = asc.call("GET", f"/appStoreVersions/{live['id']}/appStoreReviewDetail")["data"]["attributes"]
    detail = asc.call("GET", f"/appStoreVersions/{vid}/appStoreReviewDetail").get("data")
    if detail:
        asc.call("PATCH", f"/appStoreReviewDetails/{detail['id']}", {"data": {
            "type": "appStoreReviewDetails", "id": detail["id"], "attributes": {"notes": review}}})
    else:
        asc.call("POST", "/appStoreReviewDetails", {"data": {
            "type": "appStoreReviewDetails",
            "attributes": {**{k: prev.get(k) for k in REVIEW_FIELDS}, "notes": review},
            "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
    # 讀回來比對，有一欄不對就停
    back = localization(asc, vid)["attributes"]
    got = asc.call("GET", f"/appStoreVersions/{vid}/appStoreReviewDetail")["data"]["attributes"]
    final = asc.call("GET", f"/appStoreVersions/{vid}")["data"]["attributes"]
    phased = asc.call("GET", f"/appStoreVersions/{vid}/appStoreVersionPhasedRelease").get("data")
    checks = {
        "新功能": back["whatsNew"] == notes,
        "宣傳文字": back["promotionalText"] == promo,
        "描述沒動": back["description"] == old["description"],
        "審查備註": got["notes"] == review,
        "聯絡資料有帶": all(got.get(k) for k in REVIEW_FIELDS[:4]),
        "審過自動發": final["releaseType"] == RELEASE,
        "沒有分階段": not phased,
    }
    for name, good in checks.items():
        print(f"  {'對' if good else '不對'}：{name}")
    if not all(checks.values()):
        sys.exit("有一欄不對。停，沒有送審。")
    return vid


def submit(asc, app_id, vid, number):
    builds = asc.call("GET", f"/builds?filter[app]={app_id}&filter[version]={number}"
                             f"&filter[preReleaseVersion.version]={VERSION}&limit=5")["data"]
    if not builds or builds[0]["attributes"]["processingState"] != "VALID":
        sys.exit(f"{VERSION} 的 build {number} 找不到或還沒處理好。停。")
    asc.call("PATCH", f"/appStoreVersions/{vid}/relationships/build",
             {"data": {"type": "builds", "id": builds[0]["id"]}})
    print(f"已選 build {number}")
    opened = asc.call("GET", f"/reviewSubmissions?filter[app]={app_id}&filter[platform]=IOS"
                             "&filter[state]=READY_FOR_REVIEW")["data"]
    if opened:
        sid = opened[0]["id"]
    else:
        sid = asc.call("POST", "/reviewSubmissions", {"data": {
            "type": "reviewSubmissions", "attributes": {"platform": "IOS"},
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})["data"]["id"]
    if not asc.call("GET", f"/reviewSubmissions/{sid}/items")["data"]:
        asc.call("POST", "/reviewSubmissionItems", {"data": {
            "type": "reviewSubmissionItems", "relationships": {
                "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sid}},
                "appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
    asc.call("PATCH", f"/reviewSubmissions/{sid}", {"data": {
        "type": "reviewSubmissions", "id": sid, "attributes": {"submitted": True}}})
    print("提交單狀態：", asc.call("GET", f"/reviewSubmissions/{sid}")["data"]["attributes"].get("state"))
    print(f"{VERSION} 狀態：", vstate(asc.call("GET", f"/appStoreVersions/{vid}")["data"]))


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "status"
    number = sys.argv[2] if len(sys.argv) > 2 else ""
    if mode not in ("status", "write", "submit") or (mode == "submit" and not number.isdigit()):
        sys.exit("用法：status｜write｜submit <build 號>")
    asc = ASC()
    apps = asc.call("GET", f"/apps?filter[bundleId]={BUNDLE_ID}")["data"]
    if not apps:
        sys.exit("找不到 app")
    app_id = apps[0]["id"]
    if mode == "status":
        status(asc, app_id)
        return
    vid = write(asc, app_id)
    if mode == "submit":
        submit(asc, app_id, vid, number)


main()
