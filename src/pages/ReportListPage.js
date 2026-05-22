import { store, generateReport, loadReports } from '../store.js';

export default {
  name: 'ReportListPage',
  setup() {
    const router = VueRouter.useRouter();

    const reportCatalog = [
      {
        id: 'stats-overview',
        title: '阅读数据总览',
        subtitle: '书籍、划线、想法、完读率、月度趋势一目了然',
        icon: '📊',
        type: 'local',
      },
      {
        id: 'preference-analysis',
        title: '阅读偏好分析',
        subtitle: '类型分布、虚构非虚构比、阅读深度指标',
        icon: '🔍',
        type: 'local',
      },
      {
        id: 'reading-persona',
        title: '阅读人格画像',
        subtitle: '基于阅读行为生成你独特的阅读人格',
        icon: '🎭',
        type: 'llm',
      },
      {
        id: 'mbti-reading',
        title: 'MBTI 阅读倾向',
        subtitle: '推断你的阅读型 MBTI 四维倾向',
        icon: '🧭',
        type: 'llm',
      },
      {
        id: 'cognitive-cocoon',
        title: '认知茧房指数',
        subtitle: '评估你的阅读多样性，发现知识盲区',
        icon: '🕸️',
        type: 'llm',
      },
      {
        id: 'breakout-books',
        title: '破圈书单推荐',
        subtitle: '舒适区延展、认知破壁、盲区补全书单',
        icon: '📚',
        type: 'llm',
      },
    ];

    const generating = Vue.reactive({});

    function isGenerated(id) {
      return !!store.reports[id]?.content;
    }

    function generatedAt(id) {
      const r = store.reports[id];
      if (!r?.generatedAt) return '';
      const d = new Date(r.generatedAt);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    async function onGenerate(id) {
      generating[id] = true;
      try {
        await generateReport(id);
      } finally {
        generating[id] = false;
      }
    }

    function onView(id) {
      router.push('/reports/' + id);
    }

    return {
      store,
      reportCatalog,
      generating,
      isGenerated,
      generatedAt,
      onGenerate,
      onView,
    };
  },
  template: `
    <div class="page-container">
      <h1 class="page-title">阅读报告</h1>
      <p class="page-lead">基于你的微信读书数据，生成多维度阅读洞察。本地报告即时生成，AI 报告需要配置 LLM 服务。</p>

      <div class="report-card-grid">
        <article
          v-for="report in reportCatalog"
          :key="report.id"
          class="report-card"
        >
          <div class="report-card-icon">{{ report.icon }}</div>
          <h3 class="report-card-title">{{ report.title }}</h3>
          <p class="report-card-desc">{{ report.subtitle }}</p>
          <div class="report-card-badge" :class="report.type">
            {{ report.type === 'local' ? '本地计算' : 'AI 分析' }}
          </div>
          <div class="report-card-status" v-if="isGenerated(report.id)">
            已生成 · {{ generatedAt(report.id) }}
          </div>
          <div class="report-card-status empty" v-else>未生成</div>
          <div class="report-card-actions">
            <el-button
              v-if="isGenerated(report.id)"
              type="primary"
              size="small"
              @click="onView(report.id)"
            >
              查看报告
            </el-button>
            <el-button
              size="small"
              :loading="generating[report.id]"
              :disabled="generating[report.id] || store.loading"
              @click="onGenerate(report.id)"
            >
              {{ isGenerated(report.id) ? '重新生成' : '生成报告' }}
            </el-button>
          </div>
        </article>
      </div>
    </div>
  `,
};
