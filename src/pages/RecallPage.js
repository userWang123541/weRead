import { store, request } from '../store.js';
import { compact } from '../utils.js';

export default {
  name: 'RecallPage',
  setup() {
    const inputText = Vue.ref('');
    const messages = Vue.ref([]);
    const loading = Vue.ref(false);
    const chatRef = Vue.ref(null);

    const examples = [
      '我之前读过哪些关于"认知偏差"的内容？',
      '关于时间管理，我做过哪些笔记？',
      '有没有关于亲密关系的划线？',
      '我在哪些书里读到过"自由意志"？',
      '帮我回忆一下关于"习惯养成"的读书笔记',
    ];

    async function onSend(text) {
      const query = (text || inputText.value).trim();
      if (!query || loading.value) return;

      inputText.value = '';
      messages.value.push({ role: 'user', content: query, sources: null });
      messages.value.push({ role: 'assistant', content: '', sources: null, loading: true });
      scrollToBottom();
      loading.value = true;

      try {
        const result = await request('/api/recall', {
          method: 'POST',
          body: JSON.stringify({ query }),
        });

        const lastMsg = messages.value[messages.value.length - 1];
        lastMsg.content = result.answer || '未能生成回答。';
        lastMsg.sources = result.sources || [];
        lastMsg.loading = false;
      } catch (err) {
        const lastMsg = messages.value[messages.value.length - 1];
        lastMsg.content = '请求失败：' + err.message;
        lastMsg.loading = false;
      } finally {
        loading.value = false;
        scrollToBottom();
      }
    }

    function scrollToBottom() {
      Vue.nextTick(() => {
        if (chatRef.value) chatRef.value.scrollTop = chatRef.value.scrollHeight;
      });
    }

    function onKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    }

    return {
      store,
      inputText,
      messages,
      loading,
      chatRef,
      examples,
      onSend,
      onKeyDown,
      compact,
    };
  },
  template: `
    <div class="recall-page">
      <!-- 对话区 -->
      <div class="recall-main">
        <div class="recall-header">
          <h1 class="page-title">AI 笔记召回</h1>
          <p class="recall-desc">描述你想找的内容，AI 会从你的阅读笔记中召回相关素材并回答。</p>
        </div>

        <div ref="chatRef" class="recall-chat">
          <!-- 空状态：示例提问 -->
          <div v-if="!messages.length" class="recall-empty">
            <div class="recall-empty-icon">💬</div>
            <h3>试试问我...</h3>
            <div class="recall-examples">
              <button
                v-for="ex in examples"
                :key="ex"
                class="recall-example-btn"
                @click="onSend(ex)"
              >{{ ex }}</button>
            </div>
          </div>

          <!-- 消息列表 -->
          <div v-for="(msg, i) in messages" :key="i" class="recall-msg" :class="msg.role">
            <div class="recall-msg-avatar">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
            <div class="recall-msg-body">
              <div v-if="msg.loading" class="recall-thinking">正在从笔记中查找...</div>
              <div v-else class="recall-msg-text" v-html="msg.content"></div>
            </div>
          </div>
        </div>

        <!-- 输入区 -->
        <div class="recall-input-area">
          <div class="recall-input-wrap">
            <textarea
              v-model="inputText"
              placeholder="描述你想找的内容，比如：我之前读过哪些关于认知偏差的书？"
              rows="1"
              @keydown="onKeyDown"
              :disabled="loading"
            ></textarea>
            <button
              class="recall-send-btn"
              :disabled="!inputText.trim() || loading"
              @click="onSend()"
            >↑</button>
          </div>
        </div>
      </div>

      <!-- 来源面板 -->
      <aside class="recall-sources" v-if="messages.length">
        <div class="recall-sources-title">召回来源</div>
        <div v-if="!lastSources.length" class="recall-sources-empty">暂无来源</div>
        <div v-else class="recall-sources-list">
          <div v-for="(src, i) in lastSources" :key="i" class="recall-source-item">
            <div class="recall-source-head">
              <span class="recall-source-rank">{{ i + 1 }}</span>
              <span class="recall-source-book">{{ src.bookTitle }}</span>
              <span class="recall-source-score">{{ src.score }}%</span>
            </div>
            <blockquote v-if="src.quote" class="recall-source-quote">{{ compact(src.quote, 120) }}</blockquote>
            <div v-if="src.note" class="recall-source-note">{{ compact(src.note, 100) }}</div>
          </div>
        </div>
      </aside>
    </div>
  `,
  computed: {
    lastSources() {
      for (let i = this.messages.length - 1; i >= 0; i--) {
        if (this.messages[i].role === 'assistant' && this.messages[i].sources?.length) {
          return this.messages[i].sources;
        }
      }
      return [];
    },
  },
};
