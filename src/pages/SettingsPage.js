import { store, syncData, loadData } from '../store.js';

export default {
  name: 'SettingsPage',
  setup() {
    const localKey = Vue.ref(store.apiKey || '');
    const saved = Vue.ref(false);
    const testing = Vue.ref(false);
    const testResult = Vue.ref(null);

    function saveKey() {
      store.apiKey = localKey.value.trim();
      if (store.apiKey) {
        localStorage.setItem('weread_api_key', store.apiKey);
      } else {
        localStorage.removeItem('weread_api_key');
      }
      saved.value = true;
      setTimeout(() => { saved.value = false; }, 2000);
    }

    function clearKey() {
      localKey.value = '';
      store.apiKey = '';
      localStorage.removeItem('weread_api_key');
      saved.value = false;
      testResult.value = null;
    }

    async function testConnection() {
      if (!localKey.value.trim()) {
        testResult.value = { ok: false, msg: '请先输入 API Key' };
        return;
      }
      testing.value = true;
      testResult.value = null;
      const origKey = store.apiKey;
      store.apiKey = localKey.value.trim();
      try {
        await loadData();
        testResult.value = {
          ok: true,
          msg: `连接成功！已加载 ${store.stats.totalBooks || 0} 本书的数据。`,
        };
      } catch (err) {
        testResult.value = { ok: false, msg: `连接失败：${err.message}` };
        store.apiKey = origKey;
      } finally {
        testing.value = false;
      }
    }

    async function handleSync() {
      if (!store.apiKey.trim()) {
        store.status = '请先保存 API Key 再同步数据。';
        return;
      }
      await syncData();
    }

    return { store, localKey, saved, testing, testResult, saveKey, clearKey, testConnection, handleSync };
  },
  template: `
    <div class="settings-page">
      <div class="settings-card">
        <div class="settings-header">
          <h1>连接微信读书</h1>
          <p class="settings-sub">输入你的微信读书 API Key，即可同步书架、笔记和划线数据。</p>
        </div>

        <div class="settings-body">
          <div class="settings-field">
            <label class="settings-label">API Key</label>
            <div class="settings-input-row">
              <el-input
                v-model="localKey"
                type="password"
                show-password
                placeholder="粘贴你的微信读书 API Key"
                size="large"
                class="settings-input"
              />
            </div>
            <p class="settings-hint">
              Key 仅保存在浏览器本地，不会上传到服务器。
            </p>
          </div>

          <div class="settings-actions">
            <el-button type="primary" size="large" @click="saveKey" :disabled="!localKey.trim()">
              {{ saved ? '已保存' : '保存 Key' }}
            </el-button>
            <el-button size="large" @click="testConnection" :disabled="testing || !localKey.trim()">
              {{ testing ? '测试中...' : '测试连接' }}
            </el-button>
            <el-button size="large" @click="clearKey" :disabled="!localKey">
              清除
            </el-button>
          </div>

          <div v-if="testResult" class="settings-result" :class="testResult.ok ? 'result-ok' : 'result-fail'">
            <span class="result-icon">{{ testResult.ok ? '✓' : '✗' }}</span>
            {{ testResult.msg }}
          </div>

          <div v-if="store.apiKey" class="settings-sync-section">
            <el-divider />
            <div class="sync-row">
              <div>
                <h3>同步数据</h3>
                <p class="settings-hint">从微信读书拉取最新的书架、笔记和划线。</p>
              </div>
              <el-button type="primary" plain size="large" @click="handleSync" :loading="store.loading">
                立即同步
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-card settings-guide">
        <h2>如何获取 API Key</h2>
        <div class="guide-steps">
          <div class="guide-step">
            <span class="step-num">1</span>
            <div>
              <h4>打开微信读书网页版</h4>
              <p>访问 <a href="https://weread.qq.com" target="_blank" rel="noopener">weread.qq.com</a> 并登录。</p>
            </div>
          </div>
          <div class="guide-step">
            <span class="step-num">2</span>
            <div>
              <h4>获取 API Key</h4>
              <p>访问微信读书 API Key 获取页面，复制你的专属 Key。</p>
            </div>
          </div>
          <div class="guide-step">
            <span class="step-num">3</span>
            <div>
              <h4>粘贴并保存</h4>
              <p>将 Key 粘贴到上方输入框，点击「保存 Key」即可开始使用。</p>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-footer-status">
        <span>{{ store.status }}</span>
      </div>
    </div>
  `,
};
