import { ChatOpenAI } from '@langchain/openai';
import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createAgent } from 'langchain';
import { interrupt } from '@langchain/langgraph';

const INVITE_CODE_PROMPT =
  '请输入您的面试邀请码，以便我们为您提供个性化的面试体验';

const InviteCodeCheckSchema = z.object({
  hasInviteCode: z.boolean().describe('用户消息中是否包含邀请码'),
  inviteCode: z
    .string()
    .nullable()
    .describe('提取出的邀请码，如果没有则为null'),
});

export async function inviteCodeCheckNode(
  state: any,
  tools: {
    chatModel: ChatOpenAI;
    messageTool: Tool;
  },
) {
  const username: string = state.username ?? '';
  const messages: any[] = state.messages ?? [];
  const lastUserMsg = [...messages].reverse().find((m: any) => {
    const type = m._getType?.() ?? m.getType?.() ?? '';
    return type === 'human';
  });
  const curUserMessage: string = lastUserMsg?.content ?? state.query ?? '';

  console.log(
    `[邀请码检查] 进入 | query="${(curUserMessage ?? '').slice(0, 40)}" | inviteCode=${state.inviteCode || '(无)'} | validated=${state.inviteCodeValidated ?? false} | username="${username || '(无)'}"`,
  );

  const checkResult = await checkInviteCode(tools.chatModel, curUserMessage);
  console.log('[邀请码检查] LLM提取结果', checkResult);
  if (checkResult.hasInviteCode && checkResult.inviteCode) {
    console.log(
      '[邀请码检查] 返回: 提取成功 | inviteCode=' + checkResult.inviteCode,
    );
    return {
      inviteCode: checkResult.inviteCode,
      generation: 'inviteCodeExtracted',
      username,
    };
  }

  console.log('[邀请码检查] 未提取到邀请码，触发interrupt等待用户输入');
  const resumeValue = interrupt({
    type: 'message-invite-code-required',
    message: INVITE_CODE_PROMPT,
  });
  console.log(
    '[邀请码检查] interrupt恢复 | resumeValue="' +
      String(resumeValue ?? '').slice(0, 40) +
      '"',
  );

  const resumeText: string = (
    typeof resumeValue === 'string' ? resumeValue : String(resumeValue ?? '')
  ).trim();

  if (resumeText) {
    console.log(
      '[邀请码检查] 返回: 中断恢复，使用用户输入作为邀请码 | inviteCode=' +
        resumeText,
      '问题:' + state.query,
    );
    return {
      inviteCode: resumeText,
      interruptInput: resumeText,
      generation: 'inviteCodeResumed',
      username,
    };
  }

  console.log('[邀请码检查] 返回: 用户输入为空 | 结束流程');
  return {
    inviteCode: null,
    generation: 'inviteCodeResumed',
    username,
  };
}

async function checkInviteCode(
  chatModel: ChatOpenAI,
  userMessage: string,
): Promise<z.infer<typeof InviteCodeCheckSchema>> {
  console.log(
    '[邀请码检查] Agent调用 | msg="' + (userMessage ?? '').slice(0, 30) + '"',
  );
  try {
    const agent = createAgent({
      model: chatModel,
      responseFormat: InviteCodeCheckSchema,
      systemPrompt: `判断用户消息中是否包含面试邀请码。邀请码通常是一串字母数字组合（可能是UUID格式或其他字符串）。
如果用户消息中包含邀请码，hasInviteCode=true并提取出inviteCode。否则hasInviteCode=false。

用户消息：${userMessage}`,
    });
    const response = await agent.invoke({ messages: [] });
    return response.structuredResponse as z.infer<typeof InviteCodeCheckSchema>;
  } catch (err) {
    console.error('[邀请码检查] Agent调用失败:', err);
    return { hasInviteCode: false, inviteCode: null };
  }
}
