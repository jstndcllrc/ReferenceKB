/**
 * Shared knowledge hierarchy utilities
 * Used by both app.js and dashboard.js
 */
const KnowledgeHierarchy = (function() {
  const KNOWLEDGE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];
  const LEVEL_LABELS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

  function syncKnowledgeHierarchy(prefix, $) {
    let unlocked = true;
    for (let index = 0; index < KNOWLEDGE_LEVELS.length; index++) {
      const level = KNOWLEDGE_LEVELS[index];
      const input = $(`#${prefix}-category-${level}`);
      if (!input) continue;
      if (index === 0) {
        input.disabled = false;
        unlocked = Boolean(input.value.trim());
        continue;
      }
      input.disabled = !unlocked;
      if (!unlocked && input.value) input.value = '';
      unlocked = unlocked && Boolean(input.value.trim());
    }
  }

  function knowledgePayload(prefix, $) {
    return {
      product_id: $(`#${prefix}-product-id`).value,
      goods_name: $(`#${prefix}-goods-name`).value,
      leaf_category: $(`#${prefix}-leaf-category`).value,
      source_url: $(`#${prefix}-url`).value,
      ...Object.fromEntries(KNOWLEDGE_LEVELS.map(level => [`category_${level}`, $(`#${prefix}-category-${level}`).value])),
    };
  }

  return {
    KNOWLEDGE_LEVELS,
    LEVEL_LABELS,
    syncKnowledgeHierarchy,
    knowledgePayload,
  };
})();

// Export for both module and non-module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KnowledgeHierarchy;
}
if (typeof window !== 'undefined') {
  window.KnowledgeHierarchy = KnowledgeHierarchy;
}