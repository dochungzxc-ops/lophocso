import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, ShieldAlert, Sparkles, X } from 'lucide-react';
import type { AuthUser, ChatMessage } from '../types/classroom';
import { canUseChatbotDispatch, getTodayISO, ROLE_LABELS } from '../utils/classroomLogic';
import { classroomApi } from '../lib/api';

interface ChatbotWidgetProps {
  user: AuthUser | null;
  onDataMutated: () => Promise<void>;
}

export function ChatbotWidget({ user, onDataMutated }: ChatbotWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Xin chào. Tôi là trợ lý điều phối lớp học. Cán bộ lớp (Giáo viên, Lớp trưởng, Bí thư, Tổ trưởng) có thể ra lệnh thông báo hoặc điểm danh tự động tại đây.',
      timestamp: new Date().toISOString(),
    },
  ]);

  const endRef = useRef<HTMLDivElement | null>(null);
  const userRole = user?.role || 'guest';
  const hasDispatch = canUseChatbotDispatch(userRole);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    try {
      const res = await classroomApi.sendChatMessage({
        message: trimmed,
        history: nextHistory.slice(-8).map((m) => ({ sender: m.sender, text: m.text })),
        currentDate: getTodayISO(),
      });

      const assistantMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        sender: 'assistant',
        text: res.reply,
        timestamp: new Date().toISOString(),
        actionPerformed: res.actionPerformed,
        denied: res.denied,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (res.updated) {
        await onDataMutated();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: err instanceof Error ? err.message : 'Không thể xử lý yêu cầu lúc này.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 no-print sm:right-6 sm:bottom-6">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Mở trợ lý điều phối AI"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-blue-700 px-4 text-sm font-medium text-white shadow-lg hover:bg-blue-800 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Trợ lý lớp học AI</span>
        </button>
      ) : (
        <section
          aria-label="Trợ lý điều phối AI"
          className="flex h-[460px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-300" />
              <div>
                <h2 className="font-display text-sm font-semibold leading-tight">
                  Trợ lý điều phối AI
                </h2>
                <p className="text-[11px] text-slate-300">
                  {ROLE_LABELS[userRole]} · {hasDispatch ? 'Có quyền điều phối' : 'Chỉ trò chuyện'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Thu gọn trợ lý AI"
              className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable Conversation Thread */}
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3.5">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-blue-700 text-white'
                      : m.denied
                      ? 'border border-red-200 bg-red-50 text-red-800'
                      : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  {m.denied && (
                    <div className="mb-1 flex items-center gap-1 font-semibold text-red-700">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Không đủ quyền điều phối</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.actionPerformed && (
                    <p className="mt-1.5 border-t border-slate-100 pt-1 font-mono text-[11px] font-semibold text-emerald-700">
                      Đã thực thi: {m.actionPerformed}
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Input Bar */}
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 border-t border-slate-200 bg-white p-2.5"
          >
            <input
              type="text"
              aria-label="Nhập tin nhắn hoặc lệnh điều phối"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                hasDispatch
                  ? 'Ví dụ: Hôm nay 45/45 học sinh đi học đủ...'
                  : 'Đặt câu hỏi về hoạt động lớp...'
              }
              className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Gửi tin nhắn"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
