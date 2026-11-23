import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  HelpCircle,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  Store as StoreIcon,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import type { LanguageCode, PublicUser, SupportTicket } from '../../shared/types.ts';
import { apiFetch } from '../lib/api.ts';

const STORAGE_KEY = 'mk_support_tokens_v1';
const LEGACY_STORAGE_KEY = 'sf_support_tokens_v1';

interface SavedTicketToken {
  id: string;
  accessToken: string;
}

function readSavedTokens(): SavedTicketToken[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedTicketToken[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.id && item?.accessToken)
      : [];
  } catch {
    return [];
  }
}

function saveTicketToken(id: string, accessToken: string): void {
  if (!id || !accessToken) return;
  try {
    const prev = readSavedTokens().filter((t) => t.id !== id);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id, accessToken }, ...prev].slice(0, 20))
    );
  } catch {
    // Ignore storage errors
  }
}

function removeSavedTicketToken(id: string): void {
  try {
    const next = readSavedTokens().filter((t) => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

const BUYER_TOPICS_EN = [
  'Order status & COD',
  'Report a listing or price',
  'Warranty & returns',
  'Pickup & local courier',
];

const BUYER_TOPICS_AR = [
  'حالة الطلب والدفع عند الاستلام',
  'الإبلاغ عن عرض أو سعر',
  'الضمان والإرجاع',
  'الاستلام والتوصيل المحلي',
];

const SELLER_TOPICS_EN = [
  'Store verification & review',
  'Product catalog & CSV sync',
  'Payouts & delivery fees',
  'Storefront theme & profile',
];

const SELLER_TOPICS_AR = [
  'توثيق المتجر والمراجعة',
  'الكتالوج ومزامنة الجداول',
  'المستحقات ورسوم التوصيل',
  'مظهر المتجر والملف الشخصي',
];

interface SupportHelpCenterProps {
  open: boolean;
  onToggleOpen: (next: boolean) => void;
  defaultRole?: 'customer' | 'seller';
  user: PublicUser | null;
  lang?: LanguageCode;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const SupportHelpCenter: React.FC<SupportHelpCenterProps> = ({
  open,
  onToggleOpen,
  defaultRole = 'customer',
  user,
  lang = 'en',
  notify,
}) => {
  const isAr = lang === 'ar';
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [panelView, setPanelView] = useState<'compose' | 'list' | 'thread'>('compose');
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  // Compose form state
  const [senderRole, setSenderRole] = useState<'customer' | 'seller'>(defaultRole);
  const [senderName, setSenderName] = useState('');
  const [senderContact, setSenderContact] = useState('');
  const [topic, setTopic] = useState(isAr ? BUYER_TOPICS_AR[0] : BUYER_TOPICS_EN[0]);
  const [initialMessage, setInitialMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Thread reply state
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // Clear local ticket view whenever the signed-in account switches to guarantee strict isolation
  useEffect(() => {
    setTickets([]);
    setActiveTicketId(null);
    setPanelView('compose');
    setSenderName(user ? user.fullName : '');
    setSenderContact(user ? user.phone || user.email : '');
  }, [user?.id, user]);

  // Sync default role & topic language
  useEffect(() => {
    setSenderRole(defaultRole);
    const list =
      defaultRole === 'seller'
        ? isAr
          ? SELLER_TOPICS_AR
          : SELLER_TOPICS_EN
        : isAr
          ? BUYER_TOPICS_AR
          : BUYER_TOPICS_EN;
    setTopic(list[0]);
  }, [defaultRole, isAr]);

  const loadTickets = useCallback(async () => {
    // Only send anonymous localStorage tokens when browsing as a guest;
    // signed-in customers/sellers strictly fetch tickets owned by their userId.
    const saved = user ? [] : readSavedTokens();
    const tokenParam = saved.map((s) => `${s.id}:${s.accessToken}`).join(',');
    if (!tokenParam && !user) {
      setTickets([]);
      return;
    }
    try {
      const qs = tokenParam ? `?tokens=${encodeURIComponent(tokenParam)}` : '';
      const res = await apiFetch<{ tickets: SupportTicket[] }>(`/api/support/tickets${qs}`);
      setTickets(res.tickets || []);
      if (!user) {
        for (const tk of res.tickets || []) {
          if (tk.accessToken) saveTicketToken(tk.id, tk.accessToken);
        }
      }
    } catch {
      // Non-blocking background sync
    }
  }, [user]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Poll every 5s while chat panel is open so live replies from Support appear
  useEffect(() => {
    if (!open) return;
    loadTickets();
    const timer = window.setInterval(loadTickets, 5000);
    return () => window.clearInterval(timer);
  }, [open, loadTickets]);

  const activeTicket = useMemo(
    () => tickets.find((t) => t.id === activeTicketId) || null,
    [tickets, activeTicketId]
  );

  // If panel opens and user has an active ticket, jump directly to thread
  useEffect(() => {
    if (
      open &&
      tickets.length > 0 &&
      !activeTicketId &&
      panelView === 'compose' &&
      !initialMessage.trim()
    ) {
      setActiveTicketId(tickets[0].id);
      setPanelView('thread');
    }
  }, [open, tickets, activeTicketId, panelView, initialMessage]);

  useEffect(() => {
    if (open && panelView === 'thread') {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, panelView, activeTicket?.messages.length]);

  const answeredCount = useMemo(
    () => tickets.filter((t) => t.status === 'answered').length,
    [tickets]
  );

  const topicChoices = useMemo(() => {
    if (senderRole === 'seller') {
      return isAr ? SELLER_TOPICS_AR : SELLER_TOPICS_EN;
    }
    return isAr ? BUYER_TOPICS_AR : BUYER_TOPICS_EN;
  }, [senderRole, isAr]);

  const handleRoleSwitch = (nextRole: 'customer' | 'seller') => {
    setSenderRole(nextRole);
    const nextList =
      nextRole === 'seller'
        ? isAr
          ? SELLER_TOPICS_AR
          : SELLER_TOPICS_EN
        : isAr
          ? BUYER_TOPICS_AR
          : BUYER_TOPICS_EN;
    setTopic(nextList[0]);
  };

  const handleStartTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderName.trim() || !senderContact.trim() || !initialMessage.trim()) {
      notify(
        isAr
          ? 'يرجى إدخال الاسم ورقم الهاتف أو البريد والرسالة.'
          : 'Please enter your name, phone or email, and message.',
        'error'
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ ticket: SupportTicket }>('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          senderRole,
          senderName: senderName.trim(),
          senderContact: senderContact.trim(),
          topic,
          message: initialMessage.trim(),
        }),
      });
      if (res.ticket.accessToken && !user) {
        saveTicketToken(res.ticket.id, res.ticket.accessToken);
      }
      setTickets((prev) => [res.ticket, ...prev.filter((t) => t.id !== res.ticket.id)]);
      setActiveTicketId(res.ticket.id);
      setInitialMessage('');
      setPanelView('thread');
      notify(
        isAr
          ? 'تم إرسال رسالة الدعم. سيتواصل معك فريقنا قريباً.'
          : 'Support message sent. Our team will reply shortly.'
      );
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر إرسال رسالة الدعم.'
            : 'Could not send support message.',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const savedTok =
        activeTicket.accessToken ||
        readSavedTokens().find((t) => t.id === activeTicket.id)?.accessToken;
      const res = await apiFetch<{ ticket: SupportTicket }>(
        `/api/support/tickets/${activeTicket.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: replyText.trim(),
            accessToken: savedTok,
            senderName: user?.fullName || activeTicket.senderName,
          }),
        }
      );
      setTickets((prev) => prev.map((t) => (t.id === res.ticket.id ? res.ticket : t)));
      setReplyText('');
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر إرسال الرد.'
            : 'Could not send message.',
        'error'
      );
    } finally {
      setSendingReply(false);
    }
  };

  const handleDeleteTicket = async (ticket: SupportTicket) => {
    if (deletingId) return;
    setDeletingId(ticket.id);
    try {
      const savedTok =
        ticket.accessToken ||
        readSavedTokens().find((t) => t.id === ticket.id)?.accessToken ||
        '';
      await apiFetch(`/api/support/tickets/${ticket.id}`, {
        method: 'DELETE',
        headers: savedTok ? { 'x-ticket-token': savedTok } : undefined,
      });
      removeSavedTicketToken(ticket.id);
      const remaining = tickets.filter((t) => t.id !== ticket.id);
      setTickets(remaining);
      if (activeTicketId === ticket.id) {
        if (remaining.length > 0) {
          setActiveTicketId(remaining[0].id);
          setPanelView('list');
        } else {
          setActiveTicketId(null);
          setPanelView('compose');
        }
      }
      notify(isAr ? 'تم حذف التذكرة بنجاح.' : 'Support ticket deleted.');
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر حذف التذكرة.'
            : 'Could not delete ticket.',
        'error'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(isAr ? 'ar-DZ' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusLabel = (st: SupportTicket['status']) => {
    if (!isAr) return st;
    if (st === 'resolved') return 'مغلقة';
    if (st === 'answered') return 'تم الرد';
    return 'مفتوحة';
  };

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="pointer-events-none fixed inset-0 z-[60]">
      {/* Chat Panel */}
      {open && (
        <div
          role="dialog"
          aria-label={isAr ? 'محادثة مركز الدعم في ماركتلي' : 'Marketly Help Center Support Chat'}
          className="pointer-events-auto liquid-glass fixed bottom-36 end-4 z-[60] flex max-h-[min(560px,calc(100vh-10rem))] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl shadow-2xl md:bottom-22 md:end-6 sm:w-[390px] modal-enter"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 bg-[#4A3894] px-4 py-3.5 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              {panelView !== 'compose' && tickets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPanelView(panelView === 'thread' ? 'list' : 'compose')}
                  aria-label={isAr ? 'رجوع' : 'Back'}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                </button>
              )}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#4A3894]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="font-display truncate text-sm font-bold leading-tight">
                  {isAr ? 'دعم ماركتلي المباشر' : 'Marketly Help Center'}
                </div>
                <div className="truncate text-[11px] text-[#E9DFF9]">
                  {isAr ? 'مكتب مساعدة الزبائن والتجار' : 'Customer & Seller Support Desk'}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {tickets.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (panelView === 'compose') {
                      setPanelView(tickets.length === 1 ? 'thread' : 'list');
                      if (tickets.length === 1) setActiveTicketId(tickets[0].id);
                    } else {
                      setPanelView('compose');
                    }
                  }}
                  className="rounded-full border border-white/25 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white/15 cursor-pointer"
                >
                  {panelView === 'compose'
                    ? isAr
                      ? `تذاكري (${tickets.length})`
                      : `Tickets (${tickets.length})`
                    : isAr
                      ? '+ تذكرة جديدة'
                      : '+ New'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onToggleOpen(false)}
                aria-label={isAr ? 'إغلاق محادثة الدعم' : 'Close help chat'}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4">
            {panelView === 'list' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'محادثاتك الخاصة' : 'Your Conversations'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPanelView('compose')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#4A3894] hover:underline dark:text-[#C5B2EA] cursor-pointer"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    <span>{isAr ? 'رسالة جديدة' : 'New message'}</span>
                  </button>
                </div>

                {tickets.map((tk) => {
                  const lastMsg = tk.messages[tk.messages.length - 1];
                  return (
                    <div
                      key={tk.id}
                      className="flex items-start gap-2 rounded-2xl border border-[#E4DCF7] bg-white/90 p-3 transition hover:border-[#9678CE] dark:border-[#22222C] dark:bg-[#15151C]/85"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTicketId(tk.id);
                          setPanelView('thread');
                        }}
                        className="min-w-0 flex-1 text-start cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                          <span className="font-semibold text-[#4A3894] dark:text-[#C5B2EA]">
                            {tk.senderRole === 'seller'
                              ? isAr
                                ? 'تاجر'
                                : 'Seller'
                              : isAr
                                ? 'مشتري'
                                : 'Buyer'}{' '}
                            · {statusLabel(tk.status)}
                          </span>
                          <span className="tabular-nums">{formatTime(tk.updatedAt)}</span>
                        </div>
                        <div className="mt-0.5 truncate text-xs font-bold text-[#1E1438] dark:text-white">
                          {tk.topic}
                        </div>
                        {lastMsg && (
                          <div className="mt-1 line-clamp-1 text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                            {lastMsg.sender === 'support'
                              ? isAr
                                ? 'الدعم: '
                                : 'Support: '
                              : ''}
                            {lastMsg.text}
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === tk.id}
                        onClick={() => handleDeleteTicket(tk)}
                        aria-label={isAr ? 'حذف التذكرة' : 'Delete ticket'}
                        title={isAr ? 'حذف التذكرة' : 'Delete ticket'}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {panelView === 'thread' && activeTicket && (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2 rounded-2xl border border-[#E4DCF7] bg-white/90 px-3 py-2.5 text-xs dark:border-[#22222C] dark:bg-[#15151C]/85">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold text-[#1E1438] dark:text-white">
                        {activeTicket.topic}
                      </span>
                      <span
                        className={`shrink-0 text-[11px] font-bold capitalize ${
                          activeTicket.status === 'resolved'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : activeTicket.status === 'answered'
                              ? 'text-[#4A3894] dark:text-[#E794C9]'
                              : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {statusLabel(activeTicket.status)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#5E5C70] dark:text-[#B9B0D8]">
                      {activeTicket.senderRole === 'seller'
                        ? isAr
                          ? 'دعم التجار'
                          : 'Seller Support'
                        : isAr
                          ? 'دعم الزبائن'
                          : 'Customer Support'}{' '}
                      · {activeTicket.senderName}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={deletingId === activeTicket.id}
                    onClick={() => handleDeleteTicket(activeTicket)}
                    aria-label={isAr ? 'حذف التذكرة' : 'Delete ticket'}
                    title={isAr ? 'حذف التذكرة' : 'Delete ticket'}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-200 px-2.5 py-1 text-[10.5px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/30 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>{isAr ? 'حذف' : 'Delete'}</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {activeTicket.messages.map((msg) => {
                    const isSupport = msg.sender === 'support';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isSupport ? 'items-start' : 'items-end'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            isSupport
                              ? 'rounded-es-sm border border-[#E4DCF7] bg-white text-[#1E1438] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white'
                              : 'rounded-ee-sm bg-[#4A3894] text-white'
                          }`}
                        >
                          {isSupport && (
                            <div className="mb-0.5 text-[10px] font-bold text-[#4A3894] dark:text-[#E794C9]">
                              {msg.senderName}
                            </div>
                          )}
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                        <span className="mt-1 px-1 text-[10px] text-[#7D759B] tabular-nums">
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>

                {activeTicket.status === 'resolved' && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {isAr
                        ? 'تم وضع علامة تم الحل. إرسال رسالة جديدة يعيد فتح المحادثة.'
                        : 'Marked resolved. Sending a message below will reopen this chat.'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {panelView === 'compose' && (
              <form onSubmit={handleStartTicket} className="space-y-3">
                {/* Role Switcher */}
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'أتواصل بصفتي' : 'I am contacting as'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#E4DCF7] bg-white/80 p-1 dark:border-[#22222C] dark:bg-[#15151C]">
                    <button
                      type="button"
                      onClick={() => handleRoleSwitch('customer')}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition cursor-pointer ${
                        senderRole === 'customer'
                          ? 'bg-[#4A3894] text-white'
                          : 'text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white'
                      }`}
                    >
                      <UserIcon className="h-3.5 w-3.5" />
                      <span>{isAr ? 'مشتري' : 'Buyer'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRoleSwitch('seller')}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition cursor-pointer ${
                        senderRole === 'seller'
                          ? 'bg-[#4A3894] text-white'
                          : 'text-[#5E5C70] hover:text-[#4A3894] dark:text-[#B9B0D8] dark:hover:text-white'
                      }`}
                    >
                      <StoreIcon className="h-3.5 w-3.5" />
                      <span>{isAr ? 'تاجر' : 'Seller'}</span>
                    </button>
                  </div>
                </div>

                {/* Quick Topics */}
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'الموضوع' : 'Topic'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {topicChoices.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => setTopic(choice)}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                          topic === choice
                            ? 'border-[#4A3894] bg-[#4A3894]/10 text-[#4A3894] dark:border-[#9678CE] dark:text-[#E794C9]'
                            : 'border-[#E4DCF7] text-[#5E5C70] hover:border-[#9678CE] dark:border-[#22222C] dark:text-[#B9B0D8]'
                        }`}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#5E5C70] dark:text-[#B9B0D8]">
                      {isAr ? 'الاسم الكامل' : 'Your Name'}
                    </label>
                    <input
                      required
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder={isAr ? 'الاسم الكامل' : 'Full name'}
                      className="w-full rounded-xl border border-[#E4DCF7] bg-white px-3 py-2 text-xs focus:border-[#4A3894] focus:outline-none dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#5E5C70] dark:text-[#B9B0D8]">
                      {isAr ? 'الهاتف أو البريد' : 'Phone or Email'}
                    </label>
                    <input
                      required
                      value={senderContact}
                      onChange={(e) => setSenderContact(e.target.value)}
                      placeholder="0661 ... / @marketly.dz"
                      className="w-full rounded-xl border border-[#E4DCF7] bg-white px-3 py-2 text-xs focus:border-[#4A3894] focus:outline-none dark:border-[#22222C] dark:bg-[#15151C]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#5E5C70] dark:text-[#B9B0D8]">
                    {isAr ? 'كيف يمكننا مساعدتك؟' : 'How can we help?'}
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={initialMessage}
                    onChange={(e) => setInitialMessage(e.target.value)}
                    placeholder={
                      senderRole === 'seller'
                        ? isAr
                          ? 'اسأل عن تفعيل المتجر أو الجداول أو التوصيل...'
                          : 'Ask about store approval, CSV imports, catalog updates, or payouts...'
                        : isAr
                          ? 'اسأل عن حالة طلبك أو توفر منتج أو الدفع عند الاستلام...'
                          : 'Ask about an order, product stock, store verification, or COD delivery...'
                    }
                    className="w-full resize-none rounded-xl border border-[#E4DCF7] bg-white px-3 py-2 text-xs focus:border-[#4A3894] focus:outline-none dark:border-[#22222C] dark:bg-[#15151C]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#4A3894] py-2.5 text-xs font-bold text-white transition hover:bg-[#3A2B78] disabled:opacity-60 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5 rtl:rotate-180" />
                  <span>
                    {submitting
                      ? isAr
                        ? 'جاري الإرسال...'
                        : 'Sending...'
                      : isAr
                        ? 'بدء محادثة الدعم'
                        : 'Start Support Chat'}
                  </span>
                </button>
              </form>
            )}
          </div>

          {/* Reply bar inside active thread */}
          {panelView === 'thread' && activeTicket && (
            <form
              onSubmit={handleSendFollowUp}
              className="flex items-center gap-2 border-t border-[#E4DCF7] bg-white/90 p-3 dark:border-[#22222C] dark:bg-[#0E0E13]"
            >
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={isAr ? 'اكتب ردك هنا...' : 'Write a reply...'}
                className="flex-1 rounded-full border border-[#E4DCF7] bg-white px-3.5 py-2 text-xs focus:border-[#4A3894] focus:outline-none dark:border-[#22222C] dark:bg-[#15151C]"
              />
              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                aria-label={isAr ? 'إرسال رسالة الدعم' : 'Send support message'}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4A3894] text-white transition hover:bg-[#3A2B78] disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5 rtl:rotate-180" />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Always-On-Top Circular Floating Help Center Button */}
      <button
        type="button"
        onClick={() => onToggleOpen(!open)}
        aria-label={
          open
            ? isAr
              ? 'إغلاق مركز الدعم'
              : 'Close Help Center chat'
            : isAr
              ? 'فتح مركز الدعم المباشر'
              : 'Open Help Center support chat'
        }
        title={isAr ? 'مركز المساعدة · دعم ماركتلي' : 'Marketly Help Center'}
        className="pointer-events-auto fixed bottom-20 end-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-[#4A3894] text-white shadow-2xl ring-2 ring-white transition-transform duration-150 hover:scale-105 hover:bg-[#3A2B78] focus:outline-none focus:ring-[#9678CE] dark:bg-[#9678CE] dark:ring-[#15151C] md:bottom-6 md:end-6 cursor-pointer"
      >
        {open ? <X className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
        {!open && answeredCount > 0 && (
          <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E794C9] px-1 text-[10px] font-extrabold text-[#1E1438] ring-2 ring-white tabular-nums dark:ring-[#0E0E13]">
            {answeredCount}
          </span>
        )}
      </button>
    </div>
  );
};
