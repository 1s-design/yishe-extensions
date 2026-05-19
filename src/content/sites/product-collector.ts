// @ts-nocheck
// product-collector.ts: 商品采集站点模块
// 提供商品信息采集 + AI 分析功能

if (!window.CoreSiteModules) {
  window.CoreSiteModules = {};
}

window.CoreSiteModules.productCollector = {
  init(siteInfo) {
    console.log("[Core ProductCollector] 商品采集模块已加载", siteInfo);
  },

  async getMenuItems(siteInfo) {
    return [
      {
        icon: "🛒",
        label: "采集商品信息",
        action: () => {
          this.collectProduct(false);
        },
      },
      {
        icon: "🤖",
        label: "采集并AI分析",
        action: () => {
          this.collectProduct(true);
        },
      },
    ];
  },

  async collectProduct(withAiAnalysis) {
    if (!window.CoreProductExtractor) {
      window.CoreToast?.show?.({ message: "商品提取器未加载", type: "error" });
      return;
    }

    const loadingId = window.CoreLoading?.show?.("正在采集商品信息...");

    try {
      // 1. 提取商品数据
      const productData = window.CoreProductExtractor.extract();

      if (!productData.title) {
        throw new Error("未能提取到商品标题，可能不是商品页面");
      }

      // 2. 如果需要 AI 分析
      let aiAnalysis = null;
      let aiModel = null;
      let aiProvider = null;

      if (withAiAnalysis) {
        window.CoreLoading?.update?.(loadingId, "正在进行 AI 分析...");
        const aiResult = await this.performAiAnalysis(productData);
        aiAnalysis = aiResult.analysis;
        aiModel = aiResult.model;
        aiProvider = aiResult.provider;
      }

      // 3. 发送到 background 保存到服务端
      window.CoreLoading?.update?.(loadingId, "正在保存到服务端...");

      const collectData = {
        action: "collectProduct",
        data: {
          collectType: "product",
          sourceUrl: productData.url,
          sourceTitle: productData.title,
          data: {
            title: productData.title,
            description: productData.description,
            price: productData.price,
            currency: productData.currency,
            images: productData.images,
            coverImage: productData.coverImage,
            specifications: productData.specifications,
            brand: productData.brand,
            rating: productData.rating,
            reviewCount: productData.reviewCount,
            seller: productData.seller,
            category: productData.category,
            platform: productData.platform,
          },
          aiAnalysis: aiAnalysis
            ? {
                ...aiAnalysis,
                model: aiModel,
                provider: aiProvider,
              }
            : null,
        },
      };

      chrome.runtime.sendMessage(collectData, (response) => {
        window.CoreLoading?.hide?.(loadingId);

        if (response && response.success) {
          window.CoreToast?.show?.({
            message: withAiAnalysis ? "商品采集并分析完成！" : "商品采集成功！",
            type: "success",
            duration: 3000,
          });
        } else {
          window.CoreToast?.show?.({
            message: "保存失败: " + (response?.error || "未知错误"),
            type: "error",
            duration: 4000,
          });
        }
      });
    } catch (error) {
      window.CoreLoading?.hide?.(loadingId);
      window.CoreToast?.show?.({
        message: "采集失败: " + error.message,
        type: "error",
        duration: 4000,
      });
    }
  },

  async performAiAnalysis(productData) {
    // 通过服务端接口获取用户的 AI API Key
    const aiKeyData = await this.fetchUserApiKey();

    if (!aiKeyData || !aiKeyData.encryptedKey) {
      throw new Error("没有可用的 AI API Key，请在管理后台配置");
    }

    const apiKey = aiKeyData.encryptedKey;
    const baseUrl = aiKeyData.config?.baseURL || "https://api.openai.com/v1";
    const model = aiKeyData.config?.model || "gpt-4o-mini";

    const prompt = this.buildAnalysisPrompt(productData);

    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content:
                "你是一个电商选品专家和数据分析专家。请分析商品信息，输出结构化的 JSON 分析结果。只输出 JSON，不要输出其他内容。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `AI 请求失败 (${response.status}): ${errorText || response.statusText}`,
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("AI 返回内容为空");
    }

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch (e) {
      throw new Error("AI 返回的 JSON 格式无效");
    }

    return {
      analysis,
      model: model,
      provider: aiKeyData.name || "openai",
    };
  },

  async fetchUserApiKey() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "getUserApiKey", feature: "extension_collect" },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || "获取 API Key 失败"));
          }
        },
      );
    });
  },

  buildAnalysisPrompt(productData) {
    const specText = productData.specifications
      ? Object.entries(productData.specifications)
          .map(([k, v]) => `  - ${k}: ${v}`)
          .join("\n")
      : "无";

    const categoryText = productData.category
      ? productData.category.join(" > ")
      : "未知";
    const ratingText = productData.rating
      ? `${productData.rating.value}/${productData.rating.max}`
      : "无";
    const reviewText = productData.reviewCount
      ? `${productData.reviewCount.count} 条`
      : "无";

    return `请分析以下商品信息，输出 JSON 格式的分析结果。

商品来源：${productData.platform}
商品链接：${productData.url}
商品标题：${productData.title}
价格信息：${productData.price || "未知"} ${productData.currency || ""}
品牌：${productData.brand || "未知"}
分类：${categoryText}
评分：${ratingText}
评论数：${reviewText}
卖家：${productData.seller?.name || "未知"}

规格参数：
${specText}

商品描述：
${(productData.description || productData.mainText || "无").substring(0, 3000)}

请输出以下 JSON 格式：
{
  "summary": "一句话总结这个商品的核心卖点",
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "targetAudience": "目标消费人群描述",
  "priceAnalysis": "价格区间分析，是否有竞争力",
  "competitiveAdvantages": ["竞争优势1", "竞争优势2"],
  "potentialIssues": ["潜在问题或风险1", "潜在问题或风险2"],
  "suggestedKeywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"],
  "categorySuggestion": "建议的商品分类",
  "podElements": ["可提取的设计元素1", "设计元素2"],
  "qualityScore": 8,
  "marketPotential": "high/medium/low"
}`;
  },
};
