/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import {
  onSnapshot,
  collection,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { motion, AnimatePresence } from "motion/react";
import {
  TrendingDown,
  TrendingUp,
  History,
  BarChart3,
  Book,
  ClipboardList,
  LogOut,
  Sparkles,
  Trash2,
  Pencil,
  X,
  Plus,
  Eye,
  EyeOff,
  ChevronUp,
  User as UserIcon,
  PieChart as LucidePieChart,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Delete,
  FileText
} from "lucide-react";
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area
} from "recharts";

import { db, auth, loginWithGoogle, handleFirestoreError, OperationType } from "./lib/firebase";
import {
  Transaction,
  UserProfile,
  CustomCategory,
  CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES
} from "./types";

const getCategoryEmoji = (category: string, customCategories: CustomCategory[] = []) => {
  const custom = customCategories.find(c => c.id === category || c.name === category);
  if (custom) return custom.emoji;

  const mapping: Record<string, string> = {
    "Food": "🍔",
    "Shopping": "🛍️",
    "Transport": "🚗",
    "Bills": "🏠",
    "Health": "🏥",
    "Entertainment": "🎮",
    "Mobile": "📱",
    "Social": "👥",
    "Repair": "🔧",
    "Pet": "🐱",
    "Beauty": "💄",
    "Home": "🏘️",
    "Travel": "✈️",
    "Education": "📚",
    "Income": "💰",
    "Salary": "💵",
    "Bonus": "🧧",
    "Investment": "📈",
    "SideHustle": "🚲",
    "Gift": "🎁",
    "Others": "📦"
  };
  return mapping[category] || "✨";
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"history" | "stats" | "reports" | "profile">("history");
  const [statsTimeframe, setStatsTimeframe] = useState<"month" | "year">("month");
  const [statsType, setStatsType] = useState<"expense" | "income">("expense");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [keypadValue, setKeypadValue] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Food");
  const [transactionType, setTransactionType] = useState<"expense" | "income">("expense");
  const [noteValue, setNoteValue] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [viewMonth, setViewMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [showAddCategory, setShowAddCategory] = useState<"expense" | "income" | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("✨");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const viewMonthRef = useRef<HTMLInputElement>(null);

  const [catManageType, setCatManageType] = useState<"expense" | "income">("expense");

  const isGlobalHidden = profile?.isGlobalHidden ?? false;

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Sync Profile
        const profileRef = doc(db, "users", u.uid);
        const unsubscribeProfile = onSnapshot(profileRef, async (snap) => {
          if (!snap.exists()) {
            const initialProfile: UserProfile = {
              uid: u.uid,
              displayName: u.displayName || "新用戶",
              photoURL: u.photoURL,
              balance: 0,
              lastActive: Timestamp.now()
            };
            try {
              await setDoc(profileRef, initialProfile);
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, `users/${u.uid}`);
            }
          } else {
            setProfile(snap.data() as UserProfile);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
        });

        // Sync Transactions
        const transactionsPath = `users/${u.uid}/transactions`;
        const tQuery = query(
          collection(db, transactionsPath),
          orderBy("timestamp", "desc")
        );
        const unsubscribeTransactions = onSnapshot(tQuery, (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
          setTransactions(list);
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, transactionsPath);
        });

        // Sync Custom Categories
        const categoriesPath = `users/${u.uid}/categories`;
        const catQuery = query(
          collection(db, categoriesPath),
          orderBy("createdAt", "desc")
        );
        const unsubscribeCategories = onSnapshot(catQuery, (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomCategory));
          setCustomCategories(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, categoriesPath);
        });

        return () => {
          unsubscribeProfile();
          unsubscribeTransactions();
          unsubscribeCategories();
        };
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleAddTransaction = async (data: any) => {
    if (!user || !profile) return;

    const path = `users/${user.uid}/transactions`;
    const newTransaction: Transaction = {
      amount: data.amount,
      type: data.type,
      category: data.category,
      note: data.note || "",
      timestamp: data.date ? Timestamp.fromDate(new Date(data.date)) : Timestamp.now()
    };

    try {
      await addDoc(collection(db, path), newTransaction);

      // Update Profile Balance
      const balanceOffset = data.type === "income" ? data.amount : -data.amount;
      const newProfileBalance = profile.balance + balanceOffset;

      await updateDoc(doc(db, "users", user.uid), {
        balance: newProfileBalance,
        lastActive: Timestamp.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleDeleteTransaction = async (t: Transaction) => {
    if (!user || !profile || !t.id) return;

    const path = `users/${user.uid}/transactions/${t.id}`;
    try {
      await deleteDoc(doc(db, path));

      // Revert balance
      const balanceOffset = t.type === "income" ? -t.amount : t.amount;
      const newBalance = profile.balance + balanceOffset;

      await updateDoc(doc(db, "users", user.uid), {
        balance: newBalance,
        lastActive: Timestamp.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const getCategoryDisplayName = (categoryId: string) => {
    if (CATEGORIES[categoryId]) return CATEGORIES[categoryId];
    const custom = customCategories.find(c => c.id === categoryId);
    return custom ? custom.name : categoryId;
  };

  const handleAddCustomCategory = async (name: string, emoji: string, type: "expense" | "income") => {
    if (!user) return;
    const path = `users/${user.uid}/categories`;
    const newCat: CustomCategory = {
      name,
      emoji,
      type,
      createdAt: Timestamp.now()
    };
    try {
      await addDoc(collection(db, path), newCat);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleDeleteCustomCategory = async (categoryId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/categories/${categoryId}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const toggleCategoryVisibility = async (id: string) => {
    if (!user || !profile) return;
    const path = `users/${user.uid}`;
    const current = profile.hiddenCategoryIds || [];
    const updated = current.includes(id) ? current.filter(i => i !== id) : [...current, id];
    try {
      await updateDoc(doc(db, path), {
        hiddenCategoryIds: updated
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const getSafeDate = (ts: any) => {
    if (!ts) return new Date();
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  };

  const groupTransactionsByDate = () => {
    const groups: { [key: string]: Transaction[] } = {};
    if (!viewMonth) return groups;
    const [y, m] = viewMonth.split('-').map(Number);

    transactions
      .filter(t => {
        const d = getSafeDate(t.timestamp);
        return d.getFullYear() === y && (d.getMonth() + 1) === m;
      })
      .forEach(t => {
        const d = getSafeDate(t.timestamp);
        const date = d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short' });
        if (!groups[date]) groups[date] = [];
        groups[date].push(t);
      });
    return groups;
  };

  const calculateExpression = (expr: string): string => {
    try {
      // Basic math evaluation for + and -
      // Using a simple split and reduce to avoid eval()
      const tokens = expr.split(/([+-])/);
      if (tokens.length === 0) return "";

      let total = parseInt(tokens[0]) || 0;
      for (let i = 1; i < tokens.length; i += 2) {
        const op = tokens[i];
        const val = parseInt(tokens[i + 1]) || 0;
        if (op === "+") total += val;
        if (op === "-") total -= val;
      }
      return total.toString();
    } catch {
      return expr;
    }
  };

  const handleKeypadPress = (val: string) => {
    if (val === "del") {
      setKeypadValue(prev => prev.slice(0, -1));
    } else if (val === "+" || val === "-") {
      // Prevent consecutive operators or starting with an operator
      if (keypadValue.length > 0 && !/[+-]$/.test(keypadValue)) {
        setKeypadValue(prev => prev + val);
      }
    } else if (val === "00") {
      if (keypadValue.length < 9) setKeypadValue(prev => prev + "00");
    } else {
      if (keypadValue.length < 10) setKeypadValue(prev => prev + val);
    }
  };

  const handleEquals = () => {
    if (!keypadValue) return;

    // If there is an operator, calculate it first
    if (/[+-]/.test(keypadValue)) {
      const result = calculateExpression(keypadValue);
      setKeypadValue(result);
    } else {
      // If it's already a single value, submit
      submitNewTransaction();
    }
  };

  const resetEntry = () => {
    setKeypadValue("");
    setNoteValue("");
    setIsAdding(false);
  };

  const submitNewTransaction = async () => {
    const amount = parseFloat(keypadValue);
    if (isNaN(amount) || amount <= 0) return;

    // 提早擷取目前的輸入狀態，避免關閉視窗後狀態被清空
    const currentData = {
      amount,
      type: transactionType,
      category: selectedCategory,
      note: noteValue,
      date: selectedDate
    };

    // 立即關閉視窗與重設輸入，提供流暢的使用者體驗
    resetEntry();

    try {
      await handleAddTransaction(currentData);
    } catch (error) {
      console.error("儲存失敗:", error);
      // 如果需要，之後可以加上提示
    }
  };
  const handleUpdateTransaction = async (updated: Transaction) => {
    if (!user || !profile || !updated.id) return;

    const path = `users/${user.uid}/transactions/${updated.id}`;
    try {
      const original = transactions.find(t => t.id === updated.id);
      if (!original) return;

      // Calculate balance diff
      let balanceDiff = 0;

      // First, "undo" the original
      balanceDiff += original.type === "income" ? -original.amount : original.amount;
      // Then, "apply" the new one
      balanceDiff += updated.type === "income" ? updated.amount : -updated.amount;

      await updateDoc(doc(db, path), {
        amount: updated.amount,
        category: updated.category,
        note: updated.note,
        type: updated.type
      });

      await updateDoc(doc(db, "users", user.uid), {
        balance: profile.balance + balanceDiff,
        lastActive: Timestamp.now()
      });

      setEditingTransaction(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-app-primary"
        >
          <Sparkles size={48} />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-100 rounded-[2.5rem] p-8 max-w-md w-full text-center space-y-6 shadow-xl shadow-slate-200"
        >
          <div className="inline-flex p-4 rounded-full bg-app-primary/10 text-app-primary mb-2">
            <TrendingUp size={48} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">寶兒專屬記帳本</h1>
          <p className="text-slate-400">
            開始記錄妳的生活點滴，每一筆支出與收入都是成長的足跡。
          </p>
          <button
            onClick={() => loginWithGoogle()}
            className="w-full bg-app-primary text-app-accent font-bold py-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-app-primary/20"
          >
            使用 Google 帳號登入
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 flex flex-col items-center">
      {/* Mobile-centric Container */}
      <div className="w-full max-w-md h-full bg-white shadow-xl shadow-slate-200 flex flex-col relative overflow-hidden">

        {/* Header */}
        <header className="app-header">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const [y, m] = viewMonth.split('-').map(Number);
                  const d = new Date(y, m - 2, 1);
                  setViewMonth(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
                }}
                className="p-1 hover:bg-black/10 rounded-full transition-colors"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="relative">
                <div
                  className="flex items-center gap-2 bg-black/10 px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-transform relative overflow-hidden"
                >
                  <span>{viewMonth.split('-')[0]}</span>
                  <div className="w-px h-3 bg-black/20 mx-1" />
                  <span className="text-sm">{viewMonth.split('-')[1]}</span>
                  <input
                    ref={viewMonthRef}
                    type="month"
                    value={viewMonth}
                    onChange={(e) => setViewMonth(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  const [y, m] = viewMonth.split('-').map(Number);
                  const d = new Date(y, m, 1);
                  setViewMonth(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
                }}
                className="p-1 hover:bg-black/10 rounded-full transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <button onClick={() => auth.signOut()} className="text-app-accent/60">
              <LogOut size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-2">
            {(() => {
              const [y, m] = viewMonth.split('-').map(Number);
              const filtered = transactions.filter(t => {
                const d = getSafeDate(t.timestamp);
                return d.getFullYear() === y && (d.getMonth() + 1) === m;
              });
              const expenseTotal = filtered.filter(t => t.type === "expense").reduce((a, b) => a + b.amount, 0);
              const incomeTotal = filtered.filter(t => t.type === "income").reduce((a, b) => a + b.amount, 0);

              return (
                <>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">支出 (Expense)</p>
                    <p className="text-2xl font-mono font-bold">
                      -{expenseTotal.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">收入 (Income)</p>
                    <p className="text-2xl font-mono font-bold">
                      +{incomeTotal.toLocaleString()}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 -mt-6">

          <AnimatePresence mode="wait">
            {activeTab === "history" && (
              <motion.div
                key="history"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6 pt-10 pb-10"
              >
                {Object.entries(groupTransactionsByDate()).map(([date, items]) => (
                  <div key={date} className="space-y-2">
                    <div className="flex justify-between items-center px-2">
                      <span className="text-[10px] font-bold text-slate-400">{date}</span>
                      <div className="flex gap-4 text-[10px] font-bold text-slate-300">
                        <span>出: {items.filter(i => i.type === "expense").reduce((a, b) => a + b.amount, 0)}</span>
                        <span>入: {items.filter(i => i.type === "income").reduce((a, b) => a + b.amount, 0)}</span>
                      </div>
                    </div>
                    <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-50 overflow-hidden shadow-sm">
                      {items.map(t => (
                        <div key={t.id} className="flex items-center justify-between p-4 px-5 active:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-lg">
                              {getCategoryEmoji(t.category, customCategories)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-700">{getCategoryDisplayName(t.category)}</p>
                              <p className="text-[10px] text-slate-400">{t.note || "無備註"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-mono font-bold ${t.type === "income" ? "text-emerald-500" : "text-slate-800"}`}>
                              {t.type === "income" ? "+" : ""}{t.amount.toLocaleString()}
                            </span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setEditingTransaction(t)} className="p-1.5 text-slate-200 hover:text-app-accent transition-colors">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handleDeleteTransaction(t)} className="p-1.5 text-slate-200 hover:text-red-400 transition-colors">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {activeTab === "stats" && (
              <motion.div
                key="stats"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="pt-10 space-y-6 pb-20"
              >
                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm">
                  <div className="flex flex-col gap-5 mb-8">
                    <div className="flex justify-center">
                      <div className="flex bg-slate-100 p-1 rounded-full w-full max-w-[200px]">
                        <button
                          onClick={() => setStatsTimeframe("month")}
                          className={`flex-1 py-1.5 text-[10px] font-bold rounded-full transition-all ${statsTimeframe === "month" ? "bg-white shadow-sm text-app-accent" : "text-slate-400"}`}
                        >月檢視</button>
                        <button
                          onClick={() => setStatsTimeframe("year")}
                          className={`flex-1 py-1.5 text-[10px] font-bold rounded-full transition-all ${statsTimeframe === "year" ? "bg-white shadow-sm text-app-accent" : "text-slate-400"}`}
                        >年檢視</button>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <div className="flex bg-slate-100 p-1 rounded-2xl w-full">
                        <button
                          onClick={() => setStatsType("expense")}
                          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${statsType === "expense" ? "bg-white shadow-sm text-red-500" : "text-slate-400"}`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${statsType === "expense" ? "bg-red-500" : "bg-slate-300"}`} />
                          支出統計
                        </button>
                        <button
                          onClick={() => setStatsType("income")}
                          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${statsType === "income" ? "bg-white shadow-sm text-emerald-500" : "text-slate-400"}`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${statsType === "income" ? "bg-emerald-500" : "bg-slate-300"}`} />
                          收入統計
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="h-64 w-full relative">
                    {(() => {
                      const [y, m] = viewMonth.split('-').map(Number);
                      const timeframeTransactions = transactions.filter(t => {
                        const tDate = getSafeDate(t.timestamp);
                        return statsTimeframe === "month"
                          ? (tDate.getMonth() + 1 === m && tDate.getFullYear() === y)
                          : tDate.getFullYear() === y;
                      });

                      const chartData = [
                        ...Object.entries(CATEGORIES),
                        ...customCategories.map(c => [c.id || c.name, c.name])
                      ]
                        .map(([key, val]) => ({
                          name: val,
                          value: timeframeTransactions
                            .filter(t => t.category === key && t.type === statsType)
                            .reduce((acc, curr) => acc + curr.amount, 0)
                        }))
                        .filter(d => d.value > 0);

                      const totalAmount = chartData.reduce((acc, curr) => acc + curr.value, 0);

                      return (
                        <>
                          {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <RePieChart>
                                <Pie
                                  data={chartData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="value"
                                >
                                  {chartData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={[
                                      "#ffcc00", "#fbbf24", "#fcd34d", "#fb7185", "#38bdf8", "#818cf8", "#34d399"
                                    ][index % 7]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      return (
                                        <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-2xl">
                                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{payload[0].name}</p>
                                          <p className="text-sm font-mono font-bold text-slate-800">
                                            ${Number(payload[0].value).toLocaleString()}
                                          </p>
                                          <p className="text-[8px] text-slate-300 mt-1">
                                            佔比 {((Number(payload[0].value) / totalAmount) * 100).toFixed(1)}%
                                          </p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                              </RePieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
                              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <LucidePieChart size={32} />
                              </div>
                              <p className="text-xs font-bold">尚無{statsType === "income" ? "收入" : "支出"}數據</p>
                            </div>
                          )}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{statsType === "income" ? "總收入" : "總支出"}</p>
                            <p className="text-xl font-mono font-bold text-slate-800">
                              ${totalAmount.toLocaleString()}
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="space-y-3 pb-8">
                  {(() => {
                    const [y, m] = viewMonth.split('-').map(Number);
                    const timeframeTransactions = transactions.filter(t => {
                      const tDate = getSafeDate(t.timestamp);
                      return statsTimeframe === "month"
                        ? (tDate.getMonth() + 1 === m && tDate.getFullYear() === y)
                        : tDate.getFullYear() === y;
                    });

                    const summaryData = [
                      ...Object.entries(CATEGORIES),
                      ...customCategories.map(c => [c.id || c.name, c.name])
                    ]
                      .map(([key, val]) => ({
                        id: key,
                        name: val,
                        value: timeframeTransactions
                          .filter(t => t.category === key && t.type === statsType)
                          .reduce((acc, curr) => acc + curr.amount, 0)
                      }))
                      .filter(d => d.value > 0)
                      .sort((a, b) => b.value - a.value);

                    const totalAmount = summaryData.reduce((acc, curr) => acc + curr.value, 0);

                    return summaryData.map((item, idx) => (
                      <div key={item.id} className="bg-white p-5 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm active:scale-[0.98] transition-all">
                        <div className="flex items-center gap-4">
                          <div
                            className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg shadow-inner"
                            style={{ backgroundColor: `${["#ffcc00", "#fbbf24", "#fcd34d", "#fb7185", "#38bdf8", "#818cf8", "#34d399"][idx % 7]}20` }}
                          >
                            {getCategoryEmoji(item.id, customCategories)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-700">{item.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(item.value / totalAmount) * 100}%` }}
                                  className="h-full"
                                  style={{ backgroundColor: ["#ffcc00", "#fbbf24", "#fcd34d", "#fb7185", "#38bdf8", "#818cf8", "#34d399"][idx % 7] }}
                                />
                              </div>
                              <span className="text-[8px] font-bold text-slate-400">{Math.round((item.value / totalAmount) * 100)}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono font-bold text-slate-800">${item.value.toLocaleString()}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{statsType === "income" ? "收入金額" : "支出金額"}</p>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </motion.div>
            )}

            {activeTab === "reports" && (
              <motion.div
                key="reports"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="pt-10 space-y-6 pb-20"
              >
                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold text-slate-800">收支趨勢 (Trend)</h3>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                        <span className="text-[10px] text-slate-400 font-bold">收入</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                        <span className="text-[10px] text-slate-400 font-bold">支出</span>
                      </div>
                    </div>
                  </div>

                  <div className="h-[200px] w-full">
                    {(() => {
                      const trendData: { day: string; expense: number; income: number }[] = [];
                      const now = new Date();
                      for (let i = 14; i >= 0; i--) {
                        const d = new Date(now);
                        d.setDate(now.getDate() - i);
                        const dayStr = `${d.getMonth() + 1}/${d.getDate()}`;

                        const dayTransactions = transactions.filter(t => {
                          const td = getSafeDate(t.timestamp);
                          return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth() && td.getDate() === d.getDate();
                        });

                        trendData.push({
                          day: dayStr,
                          expense: dayTransactions.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0),
                          income: dayTransactions.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0)
                        });
                      }

                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trendData}>
                            <defs>
                              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                              dataKey="day"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 8, fill: '#94a3b8' }}
                            />
                            <Tooltip
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', fontSize: '10px' }}
                            />
                            <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                            <Area type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>
                </div>

                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800 mb-6">財務摘要 (本月)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {(() => {
                      const [y, m] = viewMonth.split('-').map(Number);
                      const filtered = transactions.filter(t => {
                        const d = getSafeDate(t.timestamp);
                        return d.getFullYear() === y && (d.getMonth() + 1) === m;
                      });
                      const exp = filtered.filter(t => t.type === "expense").reduce((a, b) => a + b.amount, 0);
                      const inc = filtered.filter(t => t.type === "income").reduce((a, b) => a + b.amount, 0);

                      return (
                        <>
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">平均每日支出</p>
                            <p className="text-lg font-mono font-bold text-slate-700">
                              ${Math.round(exp / 30).toLocaleString()}
                            </p>
                          </div>
                          <div className={`p-4 rounded-2xl border ${(inc - exp) >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${(inc - exp) >= 0 ? "text-emerald-400" : "text-red-400"}`}>盈餘/超支</p>
                            <p className={`text-lg font-mono font-bold ${(inc - exp) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              ${(inc - exp).toLocaleString()}
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "profile" && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="pt-10 space-y-6"
              >
                <div className="text-center">
                  <div className="w-24 h-24 bg-app-primary rounded-3xl mx-auto shadow-lg shadow-app-primary/20 flex items-center justify-center text-4xl mb-4 overflow-hidden">
                    {profile?.photoURL ? (
                      <img src={profile.photoURL} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-app-accent">👤</span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-slate-800">{profile?.displayName || "新用戶"}</h2>
                  <p className="text-sm text-slate-400">{user?.email}</p>
                </div>

                <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-50 shadow-sm">
                  <div className="p-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-600">總餘額</span>
                    {(() => {
                      const total = transactions.reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc - t.amount, 0);
                      return (
                        <span className={`text-sm font-bold ${total < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                          {total < 0 ? '-' : ''}${Math.abs(total).toLocaleString()}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-600">上次活動</span>
                    <span className="text-sm font-bold text-slate-400">
                      {profile?.lastActive ? getSafeDate(profile.lastActive).toLocaleDateString() : "-"}
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">分類項目管理</h3>
                    <div className="flex bg-slate-50 p-1 rounded-xl">
                      <button
                        onClick={() => setCatManageType("expense")}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${catManageType === "expense" ? "bg-white shadow-sm text-red-500" : "text-slate-400"}`}
                      >支出</button>
                      <button
                        onClick={() => setCatManageType("income")}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${catManageType === "income" ? "bg-white shadow-sm text-emerald-500" : "text-slate-400"}`}
                      >收入</button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setNewCatName("");
                        setNewCatEmoji("✨");
                        setShowAddCategory(catManageType);
                      }}
                      className={`w-full text-xs font-bold py-3.5 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 ${catManageType === "expense" ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500"}`}
                    >
                      <Plus size={16} /> 新增{catManageType === "expense" ? "支出" : "收入"}分類
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Default Categories Section */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider ml-1">內建分類</p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(catManageType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map(([id, label]) => (
                          <div key={id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="text-lg flex-shrink-0">{getCategoryEmoji(id)}</span>
                              <span className="text-xs font-medium text-slate-600 truncate">{label}</span>
                            </div>
                            <button
                              onClick={() => toggleCategoryVisibility(id)}
                              className={`p-1.5 transition-colors ${profile?.hiddenCategoryIds?.includes(id) ? 'text-blue-500' : 'text-slate-200 hover:text-slate-400'}`}
                            >
                              {profile?.hiddenCategoryIds?.includes(id) ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Custom Categories Section */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider ml-1">自訂分類</p>
                      {customCategories.filter(c => c.type === catManageType).length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {customCategories.filter(c => c.type === catManageType).map(cat => (
                            <div key={cat.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <span className="text-lg flex-shrink-0">{cat.emoji}</span>
                                <span className="text-xs font-medium text-slate-600 truncate">{cat.name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => toggleCategoryVisibility(cat.id!)}
                                  className={`p-1.5 transition-colors ${profile?.hiddenCategoryIds?.includes(cat.id!) ? 'text-blue-500' : 'text-slate-200 hover:text-slate-400'}`}
                                >
                                  {profile?.hiddenCategoryIds?.includes(cat.id!) ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                                <button
                                  onClick={() => handleDeleteCustomCategory(cat.id!)}
                                  className="p-1.5 text-slate-200 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                          <p className="text-[10px] text-slate-300 italic">尚未建立自訂分類</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => auth.signOut()}
                  className="w-full bg-white border border-red-50 text-red-400 py-4 rounded-2xl font-bold active:bg-red-50 transition-colors"
                >
                  安全登出
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Bottom Navigation */}
        <nav className="h-20 bg-white border-t border-slate-50 flex items-center justify-between px-2 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
          <button onClick={() => setActiveTab("history")} className={`nav-item ${activeTab === "history" ? "nav-item-active" : ""}`}>
            <History size={22} strokeWidth={2.5} />
            <span className="text-[9px] font-bold">明細</span>
          </button>
          <button onClick={() => setActiveTab("stats")} className={`nav-item ${activeTab === "stats" ? "nav-item-active" : ""}`}>
            <LucidePieChart size={22} strokeWidth={2.5} />
            <span className="text-[9px] font-bold">類別</span>
          </button>

          <div className="flex-1 flex justify-center -mt-10">
            <button
              onClick={() => setIsAdding(true)}
              className="w-14 h-14 bg-app-primary rounded-full shadow-lg shadow-app-primary/40 flex items-center justify-center text-app-accent active:scale-95 transition-transform"
            >
              <Plus size={28} strokeWidth={3} />
            </button>
          </div>

          <button onClick={() => setActiveTab("reports")} className={`nav-item ${activeTab === "reports" ? "nav-item-active" : ""}`}>
            <BarChart3 size={22} strokeWidth={2.5} />
            <span className="text-[9px] font-bold">報表</span>
          </button>
          <button onClick={() => setActiveTab("profile")} className={`nav-item ${activeTab === "profile" ? "nav-item-active" : ""}`}>
            <UserIcon size={22} strokeWidth={2.5} />
            <span className="text-[9px] font-bold">我的</span>
          </button>
        </nav>
      </div>

      {/* New Transaction / Keypad Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[60] flex flex-col bg-white">
            <header className="px-6 pt-12 pb-4 flex items-center justify-between">
              <button onClick={resetEntry} className="text-slate-400 font-bold text-sm">取消</button>
              <div className="flex bg-slate-100 p-1 rounded-full w-40">
                <button
                  onClick={() => {
                    setTransactionType("expense");
                    setSelectedCategory("Food");
                  }}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-full transition-all ${transactionType === "expense" ? "bg-white shadow-sm" : "opacity-40"}`}
                >支出</button>
                <button
                  onClick={() => {
                    setTransactionType("income");
                    setSelectedCategory("Salary");
                  }}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-full transition-all ${transactionType === "income" ? "bg-white shadow-sm" : "opacity-40"}`}
                >收入</button>
              </div>
              <div className="w-8" /> {/* Placeholder instead of Complete button */}
            </header>

            <main className="flex-1 overflow-y-auto px-6 py-4">
              {/* Category Grid */}
              <div className="grid grid-cols-4 gap-4 pb-20">
                {/* Built-in Categories */}
                {Object.entries(transactionType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES)
                  .filter(([id]) => !(profile?.hiddenCategoryIds || []).includes(id))
                  .map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setSelectedCategory(id)}
                      className={`category-chip ${selectedCategory === id ? "category-chip-active" : ""}`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl bg-slate-50 border border-slate-100 ${selectedCategory === id ? "bg-app-primary/10 border-app-primary" : ""}`}>
                        {getCategoryEmoji(id, customCategories)}
                      </div>
                      <span className="text-[10px] font-bold whitespace-nowrap">{label}</span>
                    </button>
                  ))}

                {/* Custom Categories */}
                {customCategories
                  .filter(c => c.type === transactionType && !(profile?.hiddenCategoryIds || []).includes(c.id!))
                  .map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id!)}
                      className={`category-chip ${selectedCategory === cat.id ? "category-chip-active" : ""}`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl bg-slate-50 border border-slate-100 ${selectedCategory === cat.id ? "bg-app-primary/10 border-app-primary" : ""}`}>
                        {cat.emoji}
                      </div>
                      <span className="text-[10px] font-bold whitespace-nowrap">{cat.name}</span>
                    </button>
                  ))}
              </div>
            </main>

            {/* Input & Keypad */}
            <div className="bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase">備註:</span>
                  <input
                    value={noteValue}
                    onChange={(e) => setNoteValue(e.target.value)}
                    placeholder="點擊輸入備註..."
                    className="bg-transparent text-sm focus:outline-none"
                  />
                </div>
                <span className="text-3xl font-mono font-bold text-slate-800">
                  {keypadValue || "0"}
                </span>
              </div>

              <div className="grid grid-cols-4 border-t border-slate-50">
                {["7", "8", "9", "today"].map(key => (
                  key === "today" ? (
                    <div
                      key={key}
                      className="keypad-button flex items-center justify-center gap-1.5 cursor-pointer active:bg-slate-50 transition-colors relative"
                    >
                      <Calendar size={18} className="text-app-primary" />
                      <span className="text-xs font-bold text-slate-600">
                        {(() => {
                          const today = new Date().toISOString().split("T")[0];
                          if (selectedDate === today) return "今日";
                          const parts = selectedDate.split("-");
                          return `${parts[1]}/${parts[2]}`;
                        })()}
                      </span>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedDate(val || new Date().toISOString().split("T")[0]);
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  ) : (
                    <button
                      key={key}
                      onClick={() => handleKeypadPress(key)}
                      className="keypad-button"
                    >
                      {key}
                    </button>
                  )
                ))}
                {["4", "5", "6", "+"].map(key => (
                  <button key={key} onClick={() => handleKeypadPress(key)} className="keypad-button">{key}</button>
                ))}
                {["1", "2", "3", "-"].map(key => (
                  <button key={key} onClick={() => handleKeypadPress(key)} className="keypad-button">{key}</button>
                ))}
                {["0", "00", "del", "done"].map(key => (
                  <button
                    key={key}
                    onClick={() => key === "done" ? handleEquals() : handleKeypadPress(key)}
                    className={`keypad-button ${key === "done" ? "!bg-yellow-400 !text-slate-900 border-yellow-500 shadow-lg shadow-yellow-400/20" : ""}`}
                  >
                    {key === "del" ? <Delete size={20} /> : key === "done" ? "=" : key}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingTransaction && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold text-slate-800">修改收支紀錄</h2>
                <button
                  onClick={() => setEditingTransaction(null)}
                  className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">金額</label>
                  <input
                    type="number"
                    value={editingTransaction.amount}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, amount: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-2xl font-mono font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-app-primary/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">分類</label>
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
                    {/* Built-in */}
                    {Object.entries(editingTransaction.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES)
                      .filter(([id]) => !(profile?.hiddenCategoryIds || []).includes(id) || editingTransaction.category === id)
                      .map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setEditingTransaction({ ...editingTransaction, category: key })}
                          className={`p-2 rounded-xl text-[10px] font-bold transition-all border ${editingTransaction.category === key
                              ? "bg-app-primary text-app-accent border-app-primary shadow-lg shadow-app-primary/20"
                              : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                            }`}
                        >
                          {label}
                        </button>
                      ))}
                    {/* Custom */}
                    {customCategories
                      .filter(c => c.type === editingTransaction.type && (!(profile?.hiddenCategoryIds || []).includes(c.id!) || editingTransaction.category === c.id))
                      .map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setEditingTransaction({ ...editingTransaction, category: cat.id! })}
                          className={`p-2 rounded-xl text-[10px] font-bold transition-all border ${editingTransaction.category === cat.id
                              ? "bg-app-primary text-app-accent border-app-primary shadow-lg shadow-app-primary/20"
                              : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                            }`}
                        >
                          {cat.emoji} {cat.name}
                        </button>
                      ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">備註</label>
                  <input
                    type="text"
                    value={editingTransaction.note}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, note: e.target.value })}
                    placeholder="寫點什麼..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm text-slate-600 focus:outline-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setEditingTransaction({ ...editingTransaction, type: editingTransaction.type === "income" ? "expense" : "income" })}
                    className={`flex-1 p-4 rounded-2xl font-bold transition-all border ${editingTransaction.type === "income"
                        ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                        : "bg-red-50 text-red-600 border-red-100"
                      }`}
                  >
                    {editingTransaction.type === "income" ? "💰 收入" : "🐾 支出"}
                  </button>
                  <button
                    onClick={() => handleUpdateTransaction(editingTransaction)}
                    className="flex-[2] bg-app-primary text-app-accent font-bold rounded-2xl p-4 shadow-lg shadow-app-primary/40 active:scale-95 transition-all"
                  >
                    儲存變更
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-2xl overflow-hidden"
            >
              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-400">
                  <Trash2 size={40} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">確定要刪除分類嗎？</h3>
                  <p className="text-sm text-slate-400 mt-2">刪除後將無法恢復。</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="flex-1 bg-slate-100 text-slate-400 font-bold py-4 rounded-2xl active:scale-95 transition-all"
                  >
                    取消
                  </button>
                  <button
                    onClick={async () => {
                      await handleDeleteCustomCategory(showDeleteConfirm);
                      setShowDeleteConfirm(null);
                    }}
                    className="flex-1 bg-red-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                  >
                    確定刪除
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Category Modal */}
      <AnimatePresence>
        {showAddCategory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddCategory(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4">
                <button onClick={() => setShowAddCategory(null)} className="p-2 text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-6">
                <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-4xl shadow-inner border border-slate-100">
                  {newCatEmoji}
                </div>

                <div className="w-full space-y-4">
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-800">
                      新增{showAddCategory === "expense" ? "支出" : "收入"}分類
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">為您的新分類命名並選擇一個圖示</p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">圖示 Emoji</label>
                      <input
                        type="text"
                        value={newCatEmoji}
                        onChange={(e) => setNewCatEmoji(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center text-2xl focus:ring-2 focus:ring-app-primary/20 outline-none transition-all"
                        placeholder="請輸入一個 Emoji"
                      />

                      <div className="mt-3 flex flex-wrap gap-2 justify-center max-h-32 overflow-y-auto p-2 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                        {[
                          "🍔", "🍜", "☕", "🍺", "🍦", "🍎",
                          "🚗", "🚌", "🚲", "✈️", "⛽", "🚆",
                          "🏠", "🛍️", "🎁", "💊", "🧼", "🧺",
                          "🎮", "🎬", "🎵", "⚽", "📚", "🏖️",
                          "💰", "💳", "📈", "💻", "🏢", "📧",
                          "✨", "🏮", "🎈", "🐱", "🐶", "🌺"
                        ].map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setNewCatEmoji(emoji)}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl text-xl transition-all ${newCatEmoji === emoji ? "bg-app-primary text-app-accent scale-110 shadow-md shadow-app-primary/20" : "bg-white hover:bg-slate-100 border border-slate-100"}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">分類名稱</label>
                      <input
                        type="text"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-app-primary/20 outline-none transition-all placeholder:text-slate-300"
                        placeholder="例如：餐飲、房租、薪水..."
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (newCatName && newCatEmoji) {
                        handleAddCustomCategory(newCatName, newCatEmoji, showAddCategory);
                        setShowAddCategory(null);
                      }
                    }}
                    disabled={!newCatName || !newCatEmoji}
                    className="w-full bg-app-primary text-app-accent py-4 rounded-2xl font-bold shadow-lg shadow-app-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    確認新增
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
