// 新功能卡片接手機的那一半：記上次看過的版本。規則在 news.ts。
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { newsToShow, type News } from './news';

const KEY = 'qieji.newsSeen.v1';

// 回傳要跳的那一版（不用跳是 null），同時記下「這一版看過了」
export async function takeNews(firstRun: boolean): Promise<News | null> {
  const version = Constants.expoConfig?.version ?? '';
  if (!version) return null;
  try {
    const seen = await AsyncStorage.getItem(KEY);
    const n = newsToShow(seen, version, firstRun);
    if (seen !== version) await AsyncStorage.setItem(KEY, version);
    return n;
  } catch { return null; }
}
