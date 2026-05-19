import { Annotation } from '@langchain/langgraph';
import { UIMessage } from 'ai';

// 状态接口
export type State = {
  messages: UIMessage[];
  stream: any;
  generation: string;
  intent: string;
  intentReason: string;
  username: string;
  inviteCode: string | null;
  inviteCodeValidated: boolean;
  inviteeUserInfo: {
    id: number;
    username: string;
    email: string;
  } | null;
  query: string;
  hasValidQuestion: boolean;
  subQuestions: string[];
  mainTopic: string;
  decomposeReason: string;
  currentSubIdx: number;
  retrievalDocs: { content: string; score: number }[];
  subAnswers: string[];
  searchQuery: string;
  allRetrievedDocs: { content: string; score: number }[];
  retrievalRounds: number;
  needMoreRetrieval: boolean;
  nextSearchQuery: string;
  planReason: string;
  chatMemory: {
    role: string;
    content: string;
    timestamp: number;
    type?: string;
    webSearch?: any;
  }[];
};
// 状态图的状态类型
export type GraphState = ReturnType<
  typeof Annotation.Root<{ [K in keyof State]: typeof Annotation<State[K]> }>
>;
