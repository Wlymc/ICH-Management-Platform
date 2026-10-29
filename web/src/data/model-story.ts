export interface ModelStoryStep {
  id: string;
  number: string;
  title: string;
  kicker: string;
  projectId: number;
  modelId: string;
  summary: string;
  detail: string;
  keywords: string[];
}

export const MODEL_STORY_STEPS: ModelStoryStep[] = [
  {
    id: 'city',
    number: '01',
    title: '瓷都景德镇',
    kicker: '因瓷而兴',
    projectId: 169,
    modelId: 'ming-yongle-blue-white-vase',
    summary: '从昌江畔的窑业城市出发，观察景德镇瓷器赖以成名的器形、胎釉与装饰传统。',
    detail:
      '景德镇制瓷以细致的原料加工、分工协作和丰富的装饰体系著称。青花、粉彩、玲珑、颜色釉等传统共同构成了“瓷都”的文化面貌。先看器形与釉面，再读纹饰与工艺，会更接近一件瓷器真正的观看方式。',
    keywords: ['高岭土', '青花', '景德镇'],
  },
  {
    id: 'craft',
    number: '02',
    title: '古法制瓷工序',
    kicker: '从泥到器',
    projectId: 169,
    modelId: 'ceramic-bowl-reference',
    summary: '以碗类器形为观察对象，理解拉坯、修坯、施釉等工序如何共同决定器物的比例与手感。',
    detail:
      '传统制瓷通常要经过采料、淘洗、练泥、拉坯、修坯、施釉、绘彩、装匣和烧成等环节。器壁厚薄、圈足形态与口沿弧度，都不仅是造型问题，也记录了工匠对泥性和烧成收缩的判断。',
    keywords: ['拉坯', '修坯', '施釉'],
  },
  {
    id: 'kiln',
    number: '03',
    title: '千年窑火',
    kicker: '火候成器',
    projectId: 169,
    modelId: 'porcelain-vase-reference',
    summary: '从瓶类器物的轮廓出发，理解窑位、温度与烧成气氛如何影响最终的釉色和胎质。',
    detail:
      '瓷器能否成型，最终要交给窑火完成。不同窑位受到的温度和气氛并不完全相同，釉色、透明度与胎体致密度也会随之变化。观看器物时留意釉面流动、颜色层次和整体比例，可以更直观地理解“火候”在制瓷中的作用。',
    keywords: ['窑位', '火候', '釉色'],
  },
  {
    id: 'bluewhite',
    number: '04',
    title: '传世青花作品',
    kicker: '蓝白之间',
    projectId: 169,
    modelId: 'ming-yongle-blue-white-vase',
    summary: '回到青花天球瓶，观察钴料绘饰、透明釉与高温烧成共同形成的蓝白视觉语言。',
    detail:
      '青花以钴料在素坯上绘饰，再罩透明釉高温烧成。蓝色纹样与白色胎釉相互映衬，既适合表现花卉、龙纹等复杂图案，也形成了跨地域传播的经典瓷器风格。这里把器形、工序与窑火重新汇合到一件作品上。',
    keywords: ['钴料', '纹饰', '高温烧成'],
  },
];
