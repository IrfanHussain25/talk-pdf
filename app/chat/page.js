'use client';

import { useEffect, useState, useRef } from 'react';
import { HiMenu, HiX } from 'react-icons/hi';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
  const [session, setSession] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pdf, setPdf] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const fetchSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return router.push('/login');
      setSession(data.session);

      const { data: convs } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', data.session.user.id)
        .order('created_at', { ascending: false });
      setConversations(convs || []);
    };
    fetchSession();
  }, []);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeConversation) return;
      const { data } = await supabase
        .from('chat_history')
        .select('*')
        .eq('conversation_id', activeConversation.id)
        .order('timestamp', { ascending: true });
      setMessages(data || []);
    };
    fetchMessages();
  }, [activeConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const createNewConversation = async () => {
    const title = prompt('Enter conversation title:');
    if (!title) return;
    const { data, error } = await supabase
      .from('conversations')
      .insert([{ user_id: session.user.id, title }])
      .select()
      .single();

    if (!error) {
      setConversations([data, ...conversations]);
      setActiveConversation(data);
      setMessages([]);
    }
  };

  const deleteConversation = async (id) => {
    if (!confirm('Are you sure?')) return;
    await supabase.from('chat_history').delete().eq('conversation_id', id);
    await supabase.from('conversations').delete().eq('id', id);
    setConversations(conversations.filter(c => c.id !== id));
    if (activeConversation?.id === id) {
      setActiveConversation(null);
      setMessages([]);
    }
  };

  const handleAsk = async () => {
    if (!input || !pdf || !activeConversation) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          conversation_id: activeConversation.id,
          question: input,
          pdfBase64: base64,
        }),
      });

      const data = await res.json();
      setMessages(prev => [
        ...prev,
        { question: input, response: data.answer || data.error },
      ]);
      setInput('');
      setLoading(false);
    };
    reader.readAsDataURL(pdf);
  };

 return (
  <div className="flex h-screen text-gray-100 bg-gray-900 overflow-hidden">
    {/* Sidebar */}
    <aside
      className={`fixed md:static top-0 left-0 z-20 h-full w-64 bg-gray-800 border-r border-gray-700 p-4 flex flex-col transition-transform duration-300 transform md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="mb-4">
        <h2 className="font-bold text-lg">Conversations</h2>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`p-2 rounded cursor-pointer ${
              activeConversation?.id === conv.id
                ? 'bg-blue-800 text-white'
                : 'hover:bg-gray-700'
            }`}
            onClick={() => {
              setActiveConversation(conv);
              setSidebarOpen(false);
            }}
          >
            <div className="flex justify-between items-center">
              <span className="truncate">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
                className="text-red-400 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={handleLogout}
        className="mt-4 px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition cursor-pointer"
      >
        Logout
      </button>
    </aside>

    {/* Main Chat Area */}
    <main className="flex-1 flex flex-col h-full">
      {/* Top Bar */}
      <div className="border-b border-gray-700 p-4 bg-gray-800 shadow flex items-center justify-between relative z-30">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white text-2xl md:hidden z-40"
          >
            {sidebarOpen ? <HiX /> : <HiMenu />}
          </button>
          <h1 className="text-xl font-semibold text-white">Talk PDF</h1>
        </div>
        <button
          onClick={createNewConversation}
          className="text-blue-400 text-sm hover:underline"
        >
          + New Chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 flex flex-col-reverse bg-gray-900">
        <div ref={bottomRef} />
        {messages
          .slice()
          .reverse()
          .map((msg, idx) => (
            <div key={idx} className="space-y-2">
              <div className="bg-gray-800 p-3 rounded shadow border border-gray-700">
                <strong className="text-blue-400">You:</strong>{' '}
                <span className="text-white">{msg.question}</span>
              </div>
              <div className="bg-gray-700 p-3 rounded shadow border border-gray-600 whitespace-pre-line">
                <strong className="text-green-400">Gemini:</strong>{' '}
                <span className="text-white">{msg.response}</span>
              </div>
            </div>
          ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700 bg-gray-800 flex flex-col sm:flex-row gap-2 items-center">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setPdf(e.target.files[0])}
          className="border border-gray-600 bg-gray-700 text-white p-2 text-sm rounded w-full sm:w-auto"
        />
        <input
          type="text"
          placeholder="Ask a question..."
          className="border border-gray-600 bg-gray-700 text-white p-2 flex-1 rounded w-full sm:w-auto"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          onClick={handleAsk}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded w-full sm:w-auto"
        >
          {loading ? 'Asking...' : 'Ask'}
        </button>
      </div>
    </main>
  </div>
);


}
