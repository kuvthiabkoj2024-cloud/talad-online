"use client";

import type { Locale } from "@talad/shared";
import { LoaderCircle, MessageCircle, SendHorizontal, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { VideoComment } from "@/lib/api";
import { formatRelativeTime, interpolate } from "@/lib/format";
import { deleteVideoComment, loadVideoComments, loadVideoReplies, postVideoComment } from "@/lib/video-actions";
import { useSession } from "../auth/session-provider";
import { BottomSheet } from "../bottom-sheet";

type Dict = Dictionary["feed"];
const MAX_LENGTH = 500;

interface Thread {
  replies: VideoComment[];
  cursor: string | null;
  open: boolean;
  loading: boolean;
}

/**
 * Comments on one feed video, newest first, with one level of replies. Anyone can read;
 * posting needs an account. `onCountChange` keeps the counter on the video in step.
 */
export function CommentsSheet({
  open,
  onClose,
  productId,
  total,
  locale,
  dict,
  onCountChange,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  total: number;
  locale: Locale;
  dict: Dict;
  onCountChange: (delta: number) => void;
}) {
  const { customer } = useSession();
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, startPosting] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);

  function applyFirst(page: Awaited<ReturnType<typeof loadVideoComments>>) {
    if (!page) return setStatus("error");
    setComments(page.items);
    setCursor(page.nextCursor);
    setThreads({});
    setStatus("ready");
  }

  function retry() {
    setStatus("loading");
    void loadVideoComments(productId).then(applyFirst);
  }

  // Mounted fresh each time the sheet opens: load the first page then.
  useEffect(() => {
    let live = true;
    void loadVideoComments(productId).then((page) => live && applyFirst(page));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, []);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const page = await loadVideoComments(productId, cursor);
    setLoadingMore(false);
    if (!page) return;
    setComments((prev) => [...prev, ...page.items.filter((c) => !prev.some((p) => p.id === c.id))]);
    setCursor(page.nextCursor);
  }

  async function toggleThread(c: VideoComment, more = false) {
    const t = threads[c.id];
    if (t?.open && !more) {
      setThreads((s) => ({ ...s, [c.id]: { ...t, open: false } }));
      return;
    }
    if (t && !more && t.replies.length) {
      setThreads((s) => ({ ...s, [c.id]: { ...t, open: true } }));
      return;
    }
    setThreads((s) => ({
      ...s,
      [c.id]: {
        replies: t?.replies ?? [],
        cursor: t?.cursor ?? null,
        open: true,
        loading: true,
      },
    }));
    const page = await loadVideoReplies(productId, c.id, more ? (t?.cursor ?? undefined) : undefined);
    setThreads((s) => {
      const prev = s[c.id];
      const replies = page
        ? [
            ...(more ? prev.replies : []),
            ...page.items.filter((r) => !(more ? prev.replies : []).some((p) => p.id === r.id)),
          ]
        : prev.replies;
      return {
        ...s,
        [c.id]: {
          replies,
          cursor: page?.nextCursor ?? null,
          open: true,
          loading: false,
        },
      };
    });
  }

  function startReply(c: VideoComment) {
    setReplyTo({ id: c.parentId ?? c.id, name: c.author.name });
    setError(null);
    input.current?.focus();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || posting) return;
    if (body.length > MAX_LENGTH) return setError(dict.commentTooLong);
    setError(null);
    startPosting(async () => {
      const res = await postVideoComment(productId, body, replyTo?.id);
      if (!res.ok) {
        setError(res.error === "COMMENT_TOO_LONG" ? dict.commentTooLong : dict.commentError);
        return;
      }
      const { comment } = res;
      setText("");
      onCountChange(1);
      if (comment.parentId) {
        const parentId = comment.parentId;
        setComments((list) => list.map((c) => (c.id === parentId ? { ...c, replyCount: c.replyCount + 1 } : c)));
        setReplyTo(null);
        if (threads[parentId]) {
          setThreads((s) => ({
            ...s,
            [parentId]: {
              ...s[parentId],
              open: true,
              replies: [...s[parentId].replies, comment],
            },
          }));
        } else {
          // Thread never opened: load it (oldest first, so the new reply comes last).
          const page = await loadVideoReplies(productId, parentId);
          setThreads((s) => ({
            ...s,
            [parentId]: {
              replies: page?.items ?? [comment],
              cursor: page?.nextCursor ?? null,
              open: true,
              loading: false,
            },
          }));
        }
      } else {
        setComments((list) => [comment, ...list]);
      }
    });
  }

  async function remove(c: VideoComment) {
    const res = await deleteVideoComment(c.id);
    if (!res.ok) return;
    onCountChange(-1);
    if (c.parentId) {
      const parentId = c.parentId;
      setThreads((s) => ({
        ...s,
        [parentId]: {
          ...s[parentId],
          replies: s[parentId].replies.filter((r) => r.id !== c.id),
        },
      }));
      setComments((list) =>
        list.map((p) => (p.id === parentId ? { ...p, replyCount: Math.max(0, p.replyCount - 1) } : p)),
      );
    } else {
      // A comment with replies stays as a placeholder so the thread keeps its context.
      setComments((list) =>
        c.replyCount > 0
          ? list.map((p) => (p.id === c.id ? { ...p, body: null } : p))
          : list.filter((p) => p.id !== c.id),
      );
    }
  }

  const loginHref = `/${locale}/login?next=${encodeURIComponent(`/${locale}/feed`)}`;

  return (
    <BottomSheet open={open} onClose={onClose} title={`${dict.comments} · ${total}`} closeLabel={dict.close}>
      <div className="mx-auto flex max-w-md flex-col">
        {status === "loading" && (
          <ul className="flex flex-col gap-4 py-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex gap-3">
                <span className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
                <span className="flex flex-1 flex-col gap-2">
                  <span className="h-3 w-24 animate-pulse rounded bg-muted" />
                  <span className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                </span>
              </li>
            ))}
          </ul>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
            <p>{dict.loadFailed}</p>
            <button
              type="button"
              onClick={retry}
              className="rounded-full border border-border px-4 py-2 font-semibold text-foreground"
            >
              {dict.retry}
            </button>
          </div>
        )}

        {status === "ready" && comments.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <MessageCircle className="size-7" />
            </span>
            <p className="text-sm text-muted-foreground">{dict.noComments}</p>
          </div>
        )}

        {status === "ready" && comments.length > 0 && (
          <ul className="flex flex-col gap-4 py-2">
            {comments.map((c) => {
              const t = threads[c.id];
              const shownReplies = t?.open ? t.replies : [];
              return (
                <li key={c.id}>
                  <CommentRow
                    comment={c}
                    locale={locale}
                    dict={dict}
                    mine={customer?.id === c.author.id}
                    onReply={() => startReply(c)}
                    onDelete={() => void remove(c)}
                  />
                  {(c.replyCount > 0 || shownReplies.length > 0) && (
                    <div className="ml-12 mt-2 flex flex-col gap-3">
                      {shownReplies.map((r) => (
                        <CommentRow
                          key={r.id}
                          small
                          comment={r}
                          locale={locale}
                          dict={dict}
                          mine={customer?.id === r.author.id}
                          onReply={() => startReply(r)}
                          onDelete={() => void remove(r)}
                        />
                      ))}
                      <div className="flex gap-4">
                        {t?.loading ? (
                          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            {(!t?.open || (t.open && t.cursor)) && c.replyCount > 0 && (
                              <ThreadButton onClick={() => void toggleThread(c, !!t?.open)}>
                                {t?.open
                                  ? dict.moreReplies
                                  : interpolate(dict.viewReplies, {
                                      n: c.replyCount,
                                    })}
                              </ThreadButton>
                            )}
                            {t?.open && shownReplies.length > 0 && (
                              <ThreadButton onClick={() => void toggleThread(c)}>{dict.hideReplies}</ThreadButton>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {cursor && status === "ready" && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="my-2 flex items-center justify-center gap-2 py-2 text-sm font-semibold text-primary"
          >
            {loadingMore && <LoaderCircle className="size-4 animate-spin" />}
            {dict.moreComments}
          </button>
        )}

        {/* Composer stays at the bottom of the sheet while the list scrolls. */}
        <div className="sticky bottom-0 -mx-4 mt-2 border-t border-border bg-card px-4 pb-1 pt-3">
          {customer ? (
            <form onSubmit={submit} className="flex flex-col gap-2">
              {replyTo && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  {interpolate(dict.replyingTo, { name: replyTo.name })}
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    aria-label={dict.cancelReply}
                    className="rounded-full p-0.5 hover:bg-muted"
                  >
                    <X className="size-3.5" />
                  </button>
                </p>
              )}
              {error && (
                <p role="alert" className="text-xs text-sale">
                  {error}
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={input}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
                  }}
                  rows={1}
                  maxLength={MAX_LENGTH + 50}
                  placeholder={dict.addComment}
                  aria-label={dict.addComment}
                  className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-muted/50 px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || posting}
                  aria-label={dict.send}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
                >
                  {posting ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
                </button>
              </div>
              {text.length > MAX_LENGTH - 50 && (
                <p
                  className={`text-right text-xs tabular-nums ${text.length > MAX_LENGTH ? "text-sale" : "text-muted-foreground"}`}
                >
                  {text.length}/{MAX_LENGTH}
                </p>
              )}
            </form>
          ) : (
            <Link
              href={loginHref}
              className="flex h-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              {dict.signInToComment}
            </Link>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function CommentRow({
  comment: c,
  locale,
  dict,
  mine,
  small,
  onReply,
  onDelete,
}: {
  comment: VideoComment;
  locale: Locale;
  dict: Dict;
  mine: boolean;
  small?: boolean;
  onReply: () => void;
  onDelete: () => void;
}) {
  const deleted = c.body === null;
  return (
    <div className="flex gap-3">
      <Avatar name={c.author.name} src={c.author.avatarUrl} size={small ? "size-7" : "size-9"} />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-xs text-muted-foreground">
          <span className="truncate font-semibold text-foreground">{c.author.name}</span>
          {c.author.isShop && (
            <span className="shrink-0 rounded bg-primary px-1.5 py-px text-[10px] font-bold uppercase leading-4 tracking-wide text-primary-foreground">
              {dict.shopBadge}
            </span>
          )}
          <time dateTime={c.createdAt}>{formatRelativeTime(c.createdAt, locale, dict.justNow)}</time>
        </p>
        <p
          className={`mt-0.5 whitespace-pre-line break-words text-sm ${deleted ? "italic text-muted-foreground" : ""}`}
        >
          {deleted ? dict.commentDeleted : c.body}
        </p>
        {!deleted && (
          <div className="mt-1 flex gap-4 text-xs font-semibold text-muted-foreground">
            <button type="button" onClick={onReply} className="hover:text-foreground">
              {dict.reply}
            </button>
            {mine && (
              <button type="button" onClick={onDelete} className="flex items-center gap-1 hover:text-sale">
                <Trash2 className="size-3.5" />
                {dict.deleteComment}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
    >
      <span aria-hidden className="h-px w-6 bg-border" />
      {children}
    </button>
  );
}

function Avatar({ name, src, size }: { name: string; src: string | null; size: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-xs font-bold text-primary`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- provider avatar host varies
        <img src={src} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : (
        initials || "?"
      )}
    </span>
  );
}
