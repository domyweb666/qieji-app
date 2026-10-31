// iCloud 雲碟裡茄記資料夾的名字（iCloud 同步 S1，2026-11-01）：react-native-cloud-storage 的外掛拿 slug（qieji）當資料夾名，
// 這裡換成 app 名「茄記」——多米在「檔案」app 裡要找得到它（網頁版的備份丟進這個資料夾就會被合併進來，規劃檔 ❓2 選 B）
// 在 app.json 要排在 react-native-cloud-storage **前面**：Info.plist 的外掛是倒著跑的，排前面的最後跑，才蓋得掉它寫的名字
const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withICloudFolderName(config) {
  return withInfoPlist(config, c => {
    for (const v of Object.values(c.modResults.NSUbiquitousContainers || {})) v.NSUbiquitousContainerName = config.name;
    return c;
  });
};
