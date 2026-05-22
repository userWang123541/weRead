import { store, generateReport } from '../store.js';

const REPORT_META = {
  'stats-overview': { title: '阅读数据总览', icon: '📊' },
  'preference-analysis': { title: '阅读偏好分析', icon: '🔍' },
  'reading-persona': { title: '阅读人格画像', icon: '🎭' },
  'mbti-reading': { title: 'MBTI 阅读倾向', icon: '🧭' },
  'cognitive-cocoon': { title: '认知茧房指数', icon: '🕸️' },
  'breakout-books': { title: '破圈书单推荐', icon: '📚' },
};

export default {
  name: 'ReportDetailPage',
  setup() {
    const route = VueRouter.useRoute();
    const router = VueRouter.useRouter();
    const generating = Vue.ref(false);

    const reportId = Vue.computed(() => route.params.id);
    const meta = Vue.computed(() => REPORT_META[reportId.value] || { title: '未知报告', icon: '❓' });
    const report = Vue.computed(() => store.reports[reportId.value]?.content);
    const hasReport = Vue.computed(() => !!report.value);

    async function onGenerate() {
      generating.value = true;
      try {
        await generateReport(reportId.value);
      } finally {
        generating.value = false;
      }
    }

    function goBack() {
      router.push('/reports');
    }

    // 数据总览辅助
    function maxTrend(arr) {
      if (!arr?.length) return 1;
      return Math.max(...arr.map(i => i.count), 1);
    }

    // MBTI 辅助
    function axisWidth(axis, side) {
      if (side === 'left') return axis.leftPercent + '%';
      return axis.rightPercent + '%';
    }

    return {
      store,
      reportId,
      meta,
      report,
      hasReport,
      generating,
      onGenerate,
      goBack,
      maxTrend,
      axisWidth,
    };
  },
  template: `
    <div class="report-detail">

      <!-- 头部导航 -->
      <div class="report-detail-header">
        <button class="report-back-btn" @click="goBack">← 返回报告列表</button>
        <h1 class="report-detail-title">{{ meta.icon }} {{ meta.title }}</h1>
      </div>

      <!-- 未生成状态 -->
      <div v-if="!hasReport" class="report-empty">
        <div class="report-empty-icon">{{ meta.icon }}</div>
        <h2>尚未生成此报告</h2>
        <p>点击下方按钮开始生成</p>
        <el-button type="primary" size="large" :loading="generating" :disabled="generating || store.loading" @click="onGenerate">
          {{ generating ? '正在生成...' : '生成报告' }}
        </el-button>
      </div>

      <!-- 阅读数据总览 -->
      <div v-else-if="reportId === 'stats-overview'" class="report-body">
        <div class="rpt-hero-stats">
          <div class="rpt-hero-stat">
            <div class="rpt-hero-val">{{ report.stats.totalBooks }}</div>
            <div class="rpt-hero-label">本书籍</div>
          </div>
          <div class="rpt-hero-stat">
            <div class="rpt-hero-val">{{ report.stats.totalHighlights }}</div>
            <div class="rpt-hero-label">条划线</div>
          </div>
          <div class="rpt-hero-stat">
            <div class="rpt-hero-val">{{ report.stats.totalReviews }}</div>
            <div class="rpt-hero-label">条想法</div>
          </div>
          <div class="rpt-hero-stat">
            <div class="rpt-hero-val">{{ report.stats.completionRate }}%</div>
            <div class="rpt-hero-label">完读率</div>
          </div>
          <div class="rpt-hero-stat">
            <div class="rpt-hero-val">{{ report.stats.classifiedNotes }}</div>
            <div class="rpt-hero-label">已分类</div>
          </div>
          <div class="rpt-hero-stat">
            <div class="rpt-hero-val">{{ report.stats.avgNotesPerBook }}</div>
            <div class="rpt-hero-label">平均笔记/书</div>
          </div>
        </div>

        <div class="rpt-two-col">
          <div class="rpt-section-card">
            <h3 class="rpt-section-title">月度趋势</h3>
            <div class="rpt-chart">
              <div v-for="item in report.monthlyTrend" :key="item.month" class="rpt-bar-col">
                <div class="rpt-bar-val">{{ item.count }}</div>
                <div class="rpt-bar-track">
                  <div class="rpt-bar-fill" :style="{ height: Math.round(item.count / maxTrend(report.monthlyTrend) * 100) + '%' }"></div>
                </div>
                <div class="rpt-bar-label">{{ item.month.split('-')[1] }}月</div>
              </div>
            </div>
          </div>
          <div class="rpt-section-card">
            <h3 class="rpt-section-title">知识分类 Top 10</h3>
            <div class="rpt-rank-list">
              <div v-for="(item, i) in report.categoryDistribution" :key="item.name" class="rpt-rank-row">
                <span class="rpt-rank-idx">{{ i + 1 }}</span>
                <span class="rpt-rank-name">{{ item.name }}</span>
                <span class="rpt-rank-count">{{ item.count }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="rpt-section-card">
          <h3 class="rpt-section-title">最常阅读 Top 8</h3>
          <div class="rpt-book-list">
            <div v-for="(book, i) in report.topBooks" :key="book.title" class="rpt-book-row">
              <span class="rpt-rank-idx">{{ i + 1 }}</span>
              <div class="rpt-book-info">
                <span class="rpt-book-title">{{ book.title }}</span>
                <span class="rpt-book-author">{{ book.author }}</span>
              </div>
              <span class="rpt-rank-count">{{ book.count }} 条</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 阅读偏好分析 -->
      <div v-else-if="reportId === 'preference-analysis'" class="report-body">
        <div class="rpt-two-col">
          <div class="rpt-section-card">
            <h3 class="rpt-section-title">虚构 / 非虚构</h3>
            <div class="rpt-fnf-bar">
              <div class="rpt-fnf-fill fiction" :style="{ width: report.fictionPercent + '%' }">
                <span v-if="report.fictionPercent > 15">{{ report.fictionPercent }}%</span>
              </div>
              <div class="rpt-fnf-fill nonfiction" :style="{ width: report.nonFictionPercent + '%' }">
                <span v-if="report.nonFictionPercent > 15">{{ report.nonFictionPercent }}%</span>
              </div>
            </div>
            <div class="rpt-fnf-labels">
              <span>虚构 {{ report.fictionPercent }}%</span>
              <span>非虚构 {{ report.nonFictionPercent }}%</span>
            </div>
            <div class="rpt-style-tag">你的阅读风格：{{ report.readingStyle }}</div>
          </div>
          <div class="rpt-section-card">
            <h3 class="rpt-section-title">阅读深度</h3>
            <div class="rpt-metrics">
              <div class="rpt-metric">
                <div class="rpt-metric-val">{{ report.depthMetrics.avgNotesPerBook }}</div>
                <div class="rpt-metric-label">平均笔记/书</div>
              </div>
              <div class="rpt-metric">
                <div class="rpt-metric-val">{{ report.depthMetrics.reviewToHighlightRatio }}%</div>
                <div class="rpt-metric-label">想法/划线比</div>
              </div>
              <div class="rpt-metric">
                <div class="rpt-metric-val">{{ report.depthMetrics.avgHighlightLength }}</div>
                <div class="rpt-metric-label">平均划线字数</div>
              </div>
              <div class="rpt-metric">
                <div class="rpt-metric-val">{{ report.depthMetrics.totalReviewWords }}</div>
                <div class="rpt-metric-label">总想法字数</div>
              </div>
            </div>
          </div>
        </div>

        <div class="rpt-two-col">
          <div class="rpt-section-card">
            <h3 class="rpt-section-title">领域分布</h3>
            <div class="rpt-domain-bars">
              <div v-for="d in report.domainDistribution.slice(0, 8)" :key="d.name" class="rpt-domain-row">
                <span class="rpt-domain-name">{{ d.name }}</span>
                <div class="rpt-domain-track">
                  <div class="rpt-domain-fill" :style="{ width: d.percent + '%' }"></div>
                </div>
                <span class="rpt-domain-pct">{{ d.percent }}%</span>
              </div>
            </div>
          </div>
          <div class="rpt-section-card">
            <h3 class="rpt-section-title">最爱作者</h3>
            <div class="rpt-rank-list">
              <div v-for="(a, i) in report.topAuthors" :key="a.name" class="rpt-rank-row">
                <span class="rpt-rank-idx">{{ i + 1 }}</span>
                <span class="rpt-rank-name">{{ a.name }}</span>
                <span class="rpt-rank-count">{{ a.count }} 本</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 阅读人格画像 -->
      <div v-else-if="reportId === 'reading-persona'" class="report-body">
        <div class="persona-hero">
          <div class="persona-hero-inner">
            <div class="persona-label">你的阅读人格</div>
            <h2 class="persona-name">{{ report.title }}</h2>
            <p class="persona-subtitle">{{ report.subtitle }}</p>
          </div>
        </div>

        <div class="rpt-section-card persona-desc-card">
          <p v-for="(para, i) in report.description.split('\\n').filter(p => p.trim())" :key="i" class="persona-para">
            {{ para }}
          </p>
        </div>

        <div class="rpt-section-card">
          <h3 class="rpt-section-title">人格特质</h3>
          <div class="persona-traits">
            <div v-for="trait in report.traits" :key="trait.name" class="persona-trait">
              <div class="persona-trait-head">
                <span class="persona-trait-name">{{ trait.name }}</span>
                <span class="persona-trait-score">{{ trait.score }}</span>
              </div>
              <div class="persona-trait-bar">
                <div class="persona-trait-fill" :style="{ width: trait.score + '%' }"></div>
              </div>
              <p class="persona-trait-desc">{{ trait.description }}</p>
            </div>
          </div>
        </div>

        <div v-if="report.signatureQuote" class="persona-quote-card">
          <div class="persona-quote-mark">&ldquo;</div>
          <blockquote class="persona-quote-text">{{ report.signatureQuote }}</blockquote>
        </div>

        <div v-if="report.summary" class="rpt-section-card persona-summary">
          <p>{{ report.summary }}</p>
        </div>
      </div>

      <!-- MBTI 阅读倾向 -->
      <div v-else-if="reportId === 'mbti-reading'" class="report-body">
        <div class="mbti-hero">
          <div class="mbti-type-code">{{ report.type }}</div>
          <h2 class="mbti-type-name">{{ report.typeName }}</h2>
          <p class="mbti-reading-name">{{ report.readingTypeName }}</p>
        </div>

        <div class="rpt-section-card">
          <h3 class="rpt-section-title">四维倾向</h3>
          <div class="mbti-axes">
            <div v-for="axis in report.axes" :key="axis.dimension" class="mbti-axis">
              <div class="mbti-axis-labels">
                <span>{{ axis.leftLabel }}</span>
                <span class="mbti-axis-dim">{{ axis.dimension }}</span>
                <span>{{ axis.rightLabel }}</span>
              </div>
              <div class="mbti-axis-bar">
                <div class="mbti-axis-fill left" :style="{ width: axis.leftPercent + '%' }">
                  <span v-if="axis.leftPercent > 12">{{ axis.leftPercent }}%</span>
                </div>
                <div class="mbti-axis-fill right" :style="{ width: axis.rightPercent + '%' }">
                  <span v-if="axis.rightPercent > 12">{{ axis.rightPercent }}%</span>
                </div>
              </div>
              <p class="mbti-axis-desc">{{ axis.description }}</p>
            </div>
          </div>
        </div>

        <div v-if="report.keywords?.length" class="rpt-section-card">
          <h3 class="rpt-section-title">关键词</h3>
          <div class="mbti-keywords">
            <span v-for="kw in report.keywords" :key="kw" class="mbti-keyword">{{ kw }}</span>
          </div>
        </div>

        <div v-if="report.summary" class="rpt-section-card persona-summary">
          <p>{{ report.summary }}</p>
        </div>
      </div>

      <!-- 认知茧房指数 -->
      <div v-else-if="reportId === 'cognitive-cocoon'" class="report-body">
        <div class="cocoon-hero">
          <div class="cocoon-score-ring">
            <div class="cocoon-score-num">{{ report.score }}</div>
            <div class="cocoon-score-label">茧房指数</div>
          </div>
          <h2 class="cocoon-level">{{ report.level }}</h2>
          <p class="cocoon-level-desc">{{ report.levelDescription }}</p>
        </div>

        <div class="rpt-two-col">
          <div class="rpt-section-card">
            <h3 class="rpt-section-title">双维评分</h3>
            <div class="cocoon-dual">
              <div class="cocoon-dual-item">
                <div class="cocoon-dual-val">{{ report.diversityScore }}</div>
                <div class="cocoon-dual-label">多样性</div>
              </div>
              <div class="cocoon-dual-item">
                <div class="cocoon-dual-val">{{ report.depthScore }}</div>
                <div class="cocoon-dual-label">深度</div>
              </div>
            </div>
          </div>
          <div class="rpt-section-card">
            <h3 class="rpt-section-title">领域集中度</h3>
            <div class="rpt-domain-bars">
              <div v-for="d in report.topDomains" :key="d.domain" class="rpt-domain-row">
                <span class="rpt-domain-name">{{ d.domain }}</span>
                <div class="rpt-domain-track">
                  <div class="rpt-domain-fill" :style="{ width: d.percent + '%' }"></div>
                </div>
                <span class="rpt-domain-pct">{{ d.percent }}%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="rpt-section-card">
          <h3 class="rpt-section-title">知识盲区</h3>
          <div class="cocoon-blindspots">
            <div v-for="b in report.blindSpots" :key="b.domain" class="cocoon-blindspot">
              <h4>{{ b.domain }}</h4>
              <p class="cocoon-bs-reason">{{ b.reason }}</p>
              <p class="cocoon-bs-impact">补充后：{{ b.impact }}</p>
            </div>
          </div>
        </div>

        <div v-if="report.recommendation" class="rpt-section-card persona-summary">
          <p>{{ report.recommendation }}</p>
        </div>
      </div>

      <!-- 破圈书单推荐 -->
      <div v-else-if="reportId === 'breakout-books'" class="report-body">
        <div class="rpt-section-card">
          <h3 class="rpt-section-title">舒适区延展</h3>
          <p class="rpt-section-sub">和你已有偏好相关，但能稍微拓宽视野</p>
          <div class="breakout-grid">
            <div v-for="book in report.comfortZone" :key="book.title" class="breakout-book">
              <div class="breakout-book-domain">{{ book.domain }}</div>
              <h4 class="breakout-book-title">{{ book.title }}</h4>
              <p class="breakout-book-author">{{ book.author }}</p>
              <p class="breakout-book-reason">{{ book.reason }}</p>
              <span class="breakout-book-diff" :class="book.difficulty">{{ book.difficulty }}</span>
            </div>
          </div>
        </div>

        <div class="rpt-section-card">
          <h3 class="rpt-section-title">认知破壁</h3>
          <p class="rpt-section-sub">和你原有偏好不同，挑战你的现有认知</p>
          <div class="breakout-grid">
            <div v-for="book in report.breakthrough" :key="book.title" class="breakout-book">
              <div class="breakout-book-domain">{{ book.domain }}</div>
              <h4 class="breakout-book-title">{{ book.title }}</h4>
              <p class="breakout-book-author">{{ book.author }}</p>
              <p class="breakout-book-reason">{{ book.reason }}</p>
              <span class="breakout-book-diff" :class="book.difficulty">{{ book.difficulty }}</span>
            </div>
          </div>
        </div>

        <div class="rpt-section-card">
          <h3 class="rpt-section-title">盲区补全</h3>
          <p class="rpt-section-sub">你完全未涉猎但非常有价值的领域</p>
          <div class="breakout-grid">
            <div v-for="book in report.blindSpot" :key="book.title" class="breakout-book">
              <div class="breakout-book-domain">{{ book.domain }}</div>
              <h4 class="breakout-book-title">{{ book.title }}</h4>
              <p class="breakout-book-author">{{ book.author }}</p>
              <p class="breakout-book-reason">{{ book.reason }}</p>
              <span class="breakout-book-diff" :class="book.difficulty">{{ book.difficulty }}</span>
            </div>
          </div>
        </div>

        <div v-if="report.summary" class="rpt-section-card persona-summary">
          <p>{{ report.summary }}</p>
        </div>
      </div>

      <!-- 未知报告类型 -->
      <div v-else class="report-empty">
        <h2>未知报告类型</h2>
        <el-button @click="goBack">返回报告列表</el-button>
      </div>

    </div>
  `,
};
