export default {
  name: 'MappingPage',
  template: `
    <div class="workspace">
      <div class="content">
        <div class="mapping">
          <div class="map-row"><b><code>/api/data</code></b><span>读取本地原始数据、资料卡与统计信息。</span></div>
          <div class="map-row"><b><code>/api/sync</code></b><span>同步微信读书书籍、划线和想法，并重建资料卡。</span></div>
          <div class="map-row"><b><code>/api/classify</code></b><span>调用 BGE embedding 对笔记进行向量分类，写入已分类数据。</span></div>
          <div class="map-row"><b><code>/api/taxonomy</code></b><span>分类管理接口，前端可增删改预建分类体系。</span></div>
          <div class="map-row"><b><code>/api/material-pack</code></b><span>按主题召回资料卡，输出可引用原文、个人想法、焦点标签和写作提纲。</span></div>
        </div>
      </div>
    </div>
  `,
};
