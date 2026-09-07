export interface ArticleBlock {
  key: string;
  type: string; // 'unstyled' | 'header-one' | 'header-two' | 'header-three' | 'blockquote' | 'divider' | 'image'
  text: string;
  imageUrl?: string;
}

export interface Author {
  name: string;
  screen_name: string;
  avatar_url: string;
  verified: boolean;
  description: string;
  followers?: number;
}

export interface TweetStats {
  likes: number;
  retweets: number;
  bookmarks: number;
  replies: number;
  views?: number | null;
}

export interface ParsedTweet {
  id: string;
  url: string;
  isArticle: boolean;
  title: string;
  coverImage: string | null;
  blocks: ArticleBlock[];
  text: string;
  author: Author;
  photos: string[];
  stats: TweetStats;
  createdAt: string;
  readingTime: number; // in minutes
  wordCount: number;
}

export interface ParseResponse {
  success: boolean;
  data?: ParsedTweet;
  error?: string;
}

export interface ArticleSummary {
  oneSentence: string;
  keyTakeaways: string[];
  goldenQuote?: string;
  tags: string[];
  provider?: string;
  model?: string;
}

export interface SummarizeResponse {
  success: boolean;
  data?: ArticleSummary;
  error?: string;
}

