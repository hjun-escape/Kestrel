import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare, MoreHorizontal, PanelRight, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppHeader from "@/components/AppHeader";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import DeleteChatDialog from "@/components/assistant/DeleteChatDialog";
import { canDeleteConversation, normalizeEmail } from "@/lib/ownership";
import { AssistantPageProvider, useAssistantPage } from "@/components/assistant/AssistantContext";
import AssistantThread, { COMPOSER_ID } from "@/components/assistant/AssistantThread";
import ConversationRuntime from "@/components/assistant/ConversationRuntime";
import ContextPanel from "@/components/assistant/ContextPanel";
import { ConversationList, PortfolioList } from "@/components/assistant/Sidebar";
import { createAskAdapter } from "@/components/assistant/askAdapter";
import { seedActionStates } from "@/components/assistant/actionStore";
import { asList, storedActionStates, toInitialMessages } from "@/components/assistant/assistantData";

const MAX_CONVERSATIONS = 50;
let newChatCounter = 0;
const freshSession = () => ({ key: `new-${++newChatCounter}`, id: null, initial: [] });

// Chats are per user: loaded with created_by = the signed-in email (and the
// Conversation entity's RLS enforces the same on the server). Signed out,
// nothing is loaded or saved.
function useConversations(email) {
  const [conversations, setConversations] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    if (!email) {
      setConversations([]);
      return undefined;
    }
    setConversations(null);
    base44.entities.Conversation.filter({ created_by: email }, { limit: MAX_CONVERSATIONS, sort: "-updated_date" })
      .then((res) => active && setConversations(asList(res).filter((c) => canDeleteConversation(c, email))))
      .catch(() => {
        if (!active) return;
        setConversations([]);
        setLoadError("Saved chats could not be loaded. New chats still work.");
      });
    return () => {
      active = false;
    };
  }, [email]);

  // Returns the saved id; never throws (a failed save is shown, not fatal).
  const save = useCallback(async (id, record) => {
    if (!email) return null;
    try {
      if (id) {
        await base44.entities.Conversation.update(id, record);
        setConversations((prev) => {
          const list = prev || [];
          const existing = list.find((c) => c.id === id) || { id };
          return [{ ...existing, ...record }, ...list.filter((c) => c.id !== id)];
        });
        setSaveError(null);
        return id;
      }
      const created = await base44.entities.Conversation.create(record);
      setConversations((prev) => [{ ...record, ...created }, ...(prev || [])]);
      setSaveError(null);
      return created?.id || null;
    } catch {
      setSaveError("This chat could not be saved. Answers still work; it will retry after the next reply.");
      return id;
    }
  }, [email]);

  // Resolves to an error message, or null once the chat is gone.
  const remove = useCallback(async (conversation) => {
    if (!canDeleteConversation(conversation, email)) return "You can only delete your own chats.";
    try {
      await base44.entities.Conversation.delete(conversation.id);
    } catch {
      return "This chat could not be deleted. Try again.";
    }
    setConversations((prev) => (prev || []).filter((c) => c.id !== conversation.id));
    return null;
  }, [email]);

  return { conversations, loadError, saveError, save, remove };
}

function DrawerButton({ onClick, label, Icon, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-sm border border-ew-rule bg-ew-surface px-2.5 text-xs font-semibold text-ew-ink hover:border-ew-ink ${className}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Workspace() {
  const { user, isAuthenticated } = useAuth();
  const email = isAuthenticated ? normalizeEmail(user?.email) : "";
  const page = useAssistantPage();
  const { companies, byId, pinnedId, setPinned, setMentionedId, live } = page;
  const { conversations, loadError, saveError, save, remove } = useConversations(isAuthenticated ? user?.email || null : null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [session, setSession] = useState(freshSession);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const mentionedRef = useRef(setMentionedId);
  mentionedRef.current = setMentionedId;
  const adapter = useMemo(
    () =>
      createAskAdapter(() => ({
        ...live.current,
        onMentioned: (ids) => mentionedRef.current(ids[0]),
      })),
    [live]
  );

  useEffect(() => {
    document.title = "Assistant | Early Warning";
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById(COMPOSER_ID)?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSave = useCallback(
    async (id, record) => {
      const savedId = await save(id, record);
      if (savedId && !id) setSession((s) => ({ ...s, id: savedId }));
      return savedId;
    },
    [save]
  );

  function openConversation(c) {
    seedActionStates(storedActionStates(c.messages));
    setSession({ key: c.id, id: c.id, initial: toInitialMessages(c.messages, companies || []) });
    setPinned(c.pinned_company_id || null);
    setMentionedId(null);
    setChatsOpen(false);
  }

  function newChat() {
    setSession(freshSession());
    setMentionedId(null);
    setChatsOpen(false);
  }

  const canDelete = (c) => canDeleteConversation(c, email);

  async function confirmDelete(conversation) {
    const problem = await remove(conversation);
    if (problem) return problem;
    if (conversation.id === session.id) newChat();
    setPendingDelete(null);
    return null;
  }

  const active = (conversations || []).find((c) => c.id === session.id);
  const pinned = pinnedId ? byId[pinnedId] : null;
  const sidebar = (
    <>
      <ConversationList
        conversations={conversations}
        activeId={session.id}
        loadError={loadError}
        onSelect={openConversation}
        onNew={newChat}
        onDelete={setPendingDelete}
        canDelete={canDelete}
        signedIn={!!email}
      />
      <PortfolioList />
    </>
  );

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[260px,minmax(0,1fr)] xl:grid-cols-[264px,minmax(0,1fr),minmax(320px,360px)]">
      <aside aria-label="Chats and portfolio" className="hidden min-h-0 flex-col border-r border-ew-rule bg-ew-paper lg:flex">
        {sidebar}
      </aside>

      <main className="flex min-h-0 flex-col bg-ew-surface">
        <div className="flex min-h-[48px] items-center gap-2 border-b border-ew-rule-soft px-4">
          <DrawerButton onClick={() => setChatsOpen(true)} label="Chats" Icon={MessagesSquare} className="lg:hidden" />
          <p className="min-w-0 flex-1 truncate font-heading text-sm font-bold text-ew-ink">
            {active?.title || "New chat"}
          </p>
          {pinned && (
            <span className="inline-flex max-w-[45%] items-center gap-1 rounded-sm border border-ew-rule bg-ew-paper py-0.5 pl-2 pr-0.5 text-xs text-ew-ink">
              <span className="truncate">
                Context: <span className="font-semibold">{pinned.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setPinned(null)}
                aria-label={`Unpin ${pinned.name}`}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-ew-rule-soft"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </span>
          )}
          <DrawerButton onClick={() => setContextOpen(true)} label="Company" Icon={PanelRight} className="xl:hidden" />
          {active && canDelete(active) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Chat options"
                className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-transparent text-ew-ink-soft hover:border-ew-rule hover:text-ew-ink"
              >
                <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-sm">
                <DropdownMenuItem onSelect={() => setPendingDelete(active)} className="text-ew-red focus:text-ew-red">
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Delete chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {saveError && (
          <p role="status" className="border-b border-ew-amber-rule bg-ew-amber-bg px-4 py-1.5 text-xs text-ew-amber">
            {saveError}
          </p>
        )}
        <div className="min-h-0 flex-1">
          <ConversationRuntime
            key={session.key}
            adapter={adapter}
            initialMessages={session.initial}
            conversationId={session.id}
            onSave={handleSave}
            pinnedId={pinnedId}
          >
            <AssistantThread />
          </ConversationRuntime>
        </div>
      </main>

      <aside aria-label="Company context" className="hidden min-h-0 overflow-y-auto border-l border-ew-rule bg-ew-surface xl:block">
        <ContextPanel />
      </aside>

      <DeleteChatDialog
        conversation={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      <Sheet open={chatsOpen} onOpenChange={setChatsOpen}>
        <SheetContent side="left" className="flex w-[300px] flex-col gap-0 bg-ew-paper p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Chats and portfolio</SheetTitle>
            <SheetDescription>Open a past chat or pin a company.</SheetDescription>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>
      <Sheet open={contextOpen} onOpenChange={setContextOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto bg-ew-surface p-0 sm:max-w-[380px]">
          <SheetHeader className="sr-only">
            <SheetTitle>Company context</SheetTitle>
            <SheetDescription>Status, live source checks and latest evidence for the company in focus.</SheetDescription>
          </SheetHeader>
          <div className="pt-8">
            <ContextPanel />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function Assistant() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ew-paper text-ew-ink">
      <AppHeader />
      <AssistantPageProvider>
        <Workspace />
      </AssistantPageProvider>
    </div>
  );
}
