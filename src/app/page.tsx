'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ShieldCheck, 
  FileText, 
  Database, 
  Clock, 
  Terminal, 
  Upload,
  FolderPlus,
  Folder,
  File,
  Lock,
  Unlock,
  Eye,
  Trash2,
  Search,
  ExternalLink,
  ChevronRight,
  Shield,
  Layers,
  Settings,
  HelpCircle,
  Activity,
  UserCheck,
  Check,
  X,
  FileSpreadsheet
} from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface WorkspaceFile {
  id: string;
  workspaceId: string;
  filename: string;
  relativePath: string;
  fileType: string;
  fileSize: number;
  extractedText: string;
  ingestionStatus: string;
  ingestionError?: string | null;
  uploadedAt: string;
  permissions: {
    read: boolean;
    extract: boolean;
    context: boolean;
    modify: boolean;
    export: boolean;
  };
}

interface Task {
  id: string;
  workspace_id?: string;
  user_prompt: string;
  status: string;
  goal: string;
  constraints: string[];
  completionCriteria: string[];
  created_at: string;
  error?: string | null;
  summary?: string | null;
}

interface Action {
  id: string;
  step_number: number;
  tool_name: string;
  expected_outcome: string;
  status: string;
  retry_count: number;
  parameters: any;
  output: any;
  error?: string | null;
}

interface ExecutionLog {
  id: string;
  timestamp: string;
  level: string;
  phase: string;
  message: string;
  metadata?: any;
}

interface ApprovalRequest {
  id: string;
  tool_name: string;
  prompt: string;
  status: string;
  reason?: string;
  created_at: string;
}

interface FinanceRecord {
  id: string;
  invoice_number: string;
  vendor_name: string;
  amount: number;
  currency: string;
  due_date: string;
  invoice_date: string;
  source_file: string;
  task_id: string;
  created_at: string;
  status: string;
}

export default function OperatorOSPlatform() {
  // Navigation & Workspace State
  const [activeNav, setActiveNav] = useState<'overview' | 'tasks' | 'data' | 'permissions' | 'history' | 'settings'>('overview');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>('default');
  
  // Data files & filtering
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [fileSearch, setFileSearch] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // New Workspace Dialog
  const [showNewWsModal, setShowNewWsModal] = useState<boolean>(false);
  const [newWsName, setNewWsName] = useState<string>('');
  const [newWsDesc, setNewWsDesc] = useState<string>('');

  // AI Task Execution State
  const [taskPrompt, setTaskPrompt] = useState<string>(
    'Find the latest invoice from Acme Supplies, extract the invoice number, amount and due date, record it in our finance system, and confirm once completed.'
  );
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<{
    task: Task;
    actions: Action[];
    logs: ExecutionLog[];
    approvals: ApprovalRequest[];
    financeRecord?: FinanceRecord;
  } | null>(null);
  const [isRunningTask, setIsRunningTask] = useState<boolean>(false);
  const [approvalComment, setApprovalComment] = useState<string>('Approved with Net 30 terms: due 2025-04-10');

  // Load workspaces and files
  const loadWorkspaces = async () => {
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      if (data.workspaces) {
        setWorkspaces(data.workspaces);
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    }
  };

  const loadWorkspaceFiles = async (wsId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/files`);
      const data = await res.json();
      if (data.files) {
        setFiles(data.files);
        if (selectedFile) {
          const updated = data.files.find((f: WorkspaceFile) => f.id === selectedFile.id);
          if (updated) setSelectedFile(updated);
        }
      }
    } catch (err) {
      console.error('Failed to load workspace files:', err);
    }
  };

  const loadTasks = async (wsId: string) => {
    try {
      const res = await fetch(`/api/tasks?workspaceId=${wsId}`);
      const data = await res.json();
      if (data.tasks) {
        setTasks(data.tasks);
        if (data.tasks.length > 0 && !selectedTaskId) {
          setSelectedTaskId(data.tasks[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  useEffect(() => {
    if (currentWorkspaceId) {
      loadWorkspaceFiles(currentWorkspaceId);
      loadTasks(currentWorkspaceId);
    }
  }, [currentWorkspaceId]);

  // Task detail polling
  useEffect(() => {
    if (!selectedTaskId) return;

    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/tasks/${selectedTaskId}`);
        if (res.ok) {
          const data = await res.json();
          setTaskDetail(data);
        }
      } catch (err) {
        console.error('Task detail poll error:', err);
      }
    };

    fetchDetail();
    const interval = setInterval(fetchDetail, 2500);
    return () => clearInterval(interval);
  }, [selectedTaskId, isRunningTask]);

  // Handlers
  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) return;
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWsName, description: newWsDesc }),
      });
      const data = await res.json();
      if (data.workspace) {
        setWorkspaces(prev => [...prev, data.workspace]);
        setCurrentWorkspaceId(data.workspace.id);
        setShowNewWsModal(false);
        setNewWsName('');
        setNewWsDesc('');
      }
    } catch (err) {
      console.error('Create workspace error:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isZip = false) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < uploadedFiles.length; i++) {
      formData.append('files', uploadedFiles[i]);
    }
    if (isZip) {
      formData.append('isZip', 'true');
    }

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspaceId}/files`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        await loadWorkspaceFiles(currentWorkspaceId);
      }
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleTogglePermission = async (fileId: string, permKey: 'read' | 'extract' | 'context' | 'modify' | 'export') => {
    const targetFile = files.find(f => f.id === fileId);
    if (!targetFile) return;

    const updatedValue = !targetFile.permissions[permKey];
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspaceId}/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: {
            ...targetFile.permissions,
            [permKey]: updatedValue,
          }
        })
      });
      if (res.ok) {
        await loadWorkspaceFiles(currentWorkspaceId);
      }
    } catch (err) {
      console.error('Permission toggle error:', err);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to permanently remove this document from the workspace?')) return;
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspaceId}/files/${fileId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (selectedFile?.id === fileId) setSelectedFile(null);
        await loadWorkspaceFiles(currentWorkspaceId);
      }
    } catch (err) {
      console.error('Delete file error:', err);
    }
  };

  const handleRunTask = async (customPrompt?: string) => {
    const promptToRun = customPrompt || taskPrompt;
    if (!promptToRun.trim()) return;

    setIsRunningTask(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToRun,
          workspaceId: currentWorkspaceId,
        })
      });
      const data = await res.json();
      if (data.taskId) {
        setSelectedTaskId(data.taskId);
        await loadTasks(currentWorkspaceId);
        setActiveNav('tasks');
      }
    } catch (err) {
      console.error('Run task error:', err);
    } finally {
      setIsRunningTask(false);
      loadTasks(currentWorkspaceId);
    }
  };

  const handleResolveApproval = async (approvalId: string, approved: boolean) => {
    try {
      await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalId,
          approved,
          reason: approvalComment,
        })
      });
      await loadTasks(currentWorkspaceId);
      if (selectedTaskId) {
        const res = await fetch(`/api/tasks/${selectedTaskId}`);
        if (res.ok) setTaskDetail(await res.json());
      }
    } catch (err) {
      console.error('Resolve approval error:', err);
    }
  };

  const filteredFiles = files.filter(f => 
    f.filename.toLowerCase().includes(fileSearch.toLowerCase()) ||
    f.relativePath.toLowerCase().includes(fileSearch.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#edf1ee] text-[#435448] border border-[#d2ddd5]"><CheckCircle2 className="w-3.5 h-3.5 mr-1 text-[#526658]" /> Completed</span>;
      case 'executing':
      case 'in_progress':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#f0f4f1] text-[#334237] border border-[#c5d5ca]"><RefreshCw className="w-3.5 h-3.5 mr-1 text-[#526658] animate-spin" /> In Progress</span>;
      case 'paused_approval':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#fef8ed] text-[#8a5b17] border border-[#f5dfb8]"><AlertTriangle className="w-3.5 h-3.5 mr-1 text-[#c28224]" /> Paused (Approval)</span>;
      case 'needs_review':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#fdf5f0] text-[#91431e] border border-[#f3d2be]"><AlertTriangle className="w-3.5 h-3.5 mr-1 text-[#bd5b2a]" /> Needs Review</span>;
      case 'failed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#fdf2f2] text-[#9b2c2c] border border-[#f5c6c6]"><XCircle className="w-3.5 h-3.5 mr-1 text-[#c53030]" /> Failed</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#f4f4f1] text-[#555650] border border-[#e0e0d8]">{status}</span>;
    }
  };

  return (
    <div className="flex h-screen bg-[#fbfbfa] text-[#1c1d1a] font-sans antialiased overflow-hidden">
      {/* Persistent Left Enterprise Sidebar */}
      <aside className="w-64 border-r border-[#e5e5e0] bg-[#f7f7f4] flex flex-col justify-between select-none">
        <div>
          {/* Brand & Workspace Header */}
          <div className="p-4 border-b border-[#e5e5e0]">
            <div className="flex items-center space-x-2.5 mb-3">
              <div className="h-7 w-7 rounded bg-[#526658] text-white flex items-center justify-center font-bold text-sm shadow-sm">
                O
              </div>
              <div>
                <span className="font-semibold text-sm tracking-tight text-[#1c1d1a]">OperatorOS</span>
                <span className="block text-[11px] text-[#71726c] font-normal leading-none mt-0.5">Enterprise AI Employee</span>
              </div>
            </div>

            {/* Workspace Selector */}
            <div className="mt-3">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-semibold tracking-wider uppercase text-[#71726c]">Active Workspace</label>
                <button 
                  onClick={() => setShowNewWsModal(true)}
                  className="text-[10px] text-[#526658] hover:text-[#435448] font-medium flex items-center"
                >
                  <FolderPlus className="w-3 h-3 mr-0.5" /> New
                </button>
              </div>
              <select
                value={currentWorkspaceId}
                onChange={(e) => setCurrentWorkspaceId(e.target.value)}
                className="w-full bg-white border border-[#d8d8d0] rounded px-2.5 py-1.5 text-xs text-[#1c1d1a] focus:outline-none focus:ring-1 focus:ring-[#526658] transition"
              >
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-2 space-y-1 text-xs">
            <button
              onClick={() => setActiveNav('overview')}
              className={`w-full flex items-center px-3 py-2 rounded font-medium transition ${
                activeNav === 'overview'
                  ? 'bg-[#edf1ee] text-[#3b4c40]'
                  : 'text-[#50524c] hover:bg-[#efefe9] hover:text-[#1c1d1a]'
              }`}
            >
              <Activity className="w-4 h-4 mr-2.5 text-[#526658]" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveNav('tasks')}
              className={`w-full flex items-center px-3 py-2 rounded font-medium transition ${
                activeNav === 'tasks'
                  ? 'bg-[#edf1ee] text-[#3b4c40]'
                  : 'text-[#50524c] hover:bg-[#efefe9] hover:text-[#1c1d1a]'
              }`}
            >
              <Terminal className="w-4 h-4 mr-2.5 text-[#526658]" />
              <span>AI Tasks</span>
              {tasks.length > 0 && (
                <span className="ml-auto bg-[#e2e8e3] text-[#435448] text-[10px] px-1.5 py-0.2 rounded font-semibold">
                  {tasks.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveNav('data')}
              className={`w-full flex items-center px-3 py-2 rounded font-medium transition ${
                activeNav === 'data'
                  ? 'bg-[#edf1ee] text-[#3b4c40]'
                  : 'text-[#50524c] hover:bg-[#efefe9] hover:text-[#1c1d1a]'
              }`}
            >
              <Folder className="w-4 h-4 mr-2.5 text-[#526658]" />
              <span>Company Data</span>
              <span className="ml-auto text-[10px] text-[#71726c]">{files.length}</span>
            </button>

            <button
              onClick={() => setActiveNav('permissions')}
              className={`w-full flex items-center px-3 py-2 rounded font-medium transition ${
                activeNav === 'permissions'
                  ? 'bg-[#edf1ee] text-[#3b4c40]'
                  : 'text-[#50524c] hover:bg-[#efefe9] hover:text-[#1c1d1a]'
              }`}
            >
              <ShieldCheck className="w-4 h-4 mr-2.5 text-[#526658]" />
              <span>Permissions</span>
            </button>

            <button
              onClick={() => setActiveNav('history')}
              className={`w-full flex items-center px-3 py-2 rounded font-medium transition ${
                activeNav === 'history'
                  ? 'bg-[#edf1ee] text-[#3b4c40]'
                  : 'text-[#50524c] hover:bg-[#efefe9] hover:text-[#1c1d1a]'
              }`}
            >
              <Clock className="w-4 h-4 mr-2.5 text-[#526658]" />
              <span>Execution History</span>
            </button>

            <button
              onClick={() => setActiveNav('settings')}
              className={`w-full flex items-center px-3 py-2 rounded font-medium transition ${
                activeNav === 'settings'
                  ? 'bg-[#edf1ee] text-[#3b4c40]'
                  : 'text-[#50524c] hover:bg-[#efefe9] hover:text-[#1c1d1a]'
              }`}
            >
              <Settings className="w-4 h-4 mr-2.5 text-[#526658]" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Identity & Status Footer */}
        <div className="p-3 border-t border-[#e5e5e0] text-[11px] text-[#71726c] space-y-1 bg-[#f4f4f0]">
          <div className="flex items-center space-x-1.5 text-[#1c1d1a] font-medium">
            <UserCheck className="w-3.5 h-3.5 text-[#526658]" />
            <span>Local Demo Supervisor</span>
          </div>
          <div className="text-[10px] text-[#86877f]">
            Server Policy: Enforced
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 flex flex-col bg-[#fbfbfa] overflow-hidden">
        {/* Top Workspace Header Bar */}
        <header className="h-14 border-b border-[#e5e5e0] bg-white px-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-semibold text-[#1c1d1a] capitalize">
              {activeNav === 'overview' && 'Enterprise Workspace Overview'}
              {activeNav === 'tasks' && 'AI Employee Task Console'}
              {activeNav === 'data' && 'Company Data Documents'}
              {activeNav === 'permissions' && 'File-Level Access Governance'}
              {activeNav === 'history' && 'Audit Trail & Execution Records'}
              {activeNav === 'settings' && 'Workspace System Settings'}
            </h2>
            <span className="text-[#a0a199] text-xs">/</span>
            <span className="text-xs text-[#526658] font-medium bg-[#edf1ee] px-2 py-0.5 rounded">
              {workspaces.find(w => w.id === currentWorkspaceId)?.name || 'Default'}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {/* Quick Demo Pre-seed Button */}
            <button
              onClick={() => {
                fetch(`/api/workspaces/${currentWorkspaceId}/files`);
                loadWorkspaceFiles(currentWorkspaceId);
              }}
              className="px-3 py-1.5 text-xs text-[#50524c] hover:text-[#1c1d1a] hover:bg-[#f4f4f1] border border-[#d8d8d0] rounded font-medium flex items-center transition"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-[#526658]" />
              Sync State
            </button>
          </div>
        </header>

        {/* View Switcher Container */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* VIEW 1: OVERVIEW & LANDING PAGE */}
            {activeNav === 'overview' && (
              <div className="space-y-6">
                {/* Introduction Banner */}
                <div className="bg-white border border-[#e5e5e0] rounded-lg p-6 shadow-xs">
                  <div className="max-w-3xl space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#526658]">Enterprise Autonomy Platform</span>
                    <h1 className="text-xl font-bold text-[#1c1d1a]">OperatorOS Workspace Console</h1>
                    <p className="text-xs text-[#555650] leading-relaxed">
                      OperatorOS is an autonomous enterprise AI employee that converts natural-language business directives into verified, durable work. All file access, data ingestion, and record changes strictly enforce server-side permissions before independent database verification.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-[#f0f0eb]">
                    <div className="border border-[#e5e5e0] rounded-lg p-4 bg-[#fbfbfa] hover:border-[#d0d0c8] transition">
                      <div className="flex items-center space-x-2 text-[#526658] font-semibold text-xs mb-1">
                        <Folder className="w-4 h-4" />
                        <span>Step 1: Upload or Manage Company Data</span>
                      </div>
                      <p className="text-xs text-[#555650] mb-3">
                        Upload individual files, directory trees, or ZIP archives (TXT, Markdown, CSV, JSON, PDF). Review and configure granular read/extract permissions.
                      </p>
                      <button
                        onClick={() => setActiveNav('data')}
                        className="px-3 py-1.5 bg-[#526658] hover:bg-[#435448] text-white text-xs rounded font-medium transition"
                      >
                        Manage Company Data →
                      </button>
                    </div>

                    <div className="border border-[#e5e5e0] rounded-lg p-4 bg-[#fbfbfa] hover:border-[#d0d0c8] transition">
                      <div className="flex items-center space-x-2 text-[#526658] font-semibold text-xs mb-1">
                        <Play className="w-4 h-4" />
                        <span>Step 2: Submit Natural-Language Task</span>
                      </div>
                      <p className="text-xs text-[#555650] mb-3">
                        Issue business directives to locate invoices, summarize company policies, compare contracts, or record finance ledger entries with independent verification.
                      </p>
                      <button
                        onClick={() => setActiveNav('tasks')}
                        className="px-3 py-1.5 bg-white border border-[#d8d8d0] hover:bg-[#f4f4f1] text-[#1c1d1a] text-xs rounded font-medium transition"
                      >
                        Launch Task Console →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Workspace Highlights Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white border border-[#e5e5e0] rounded-lg p-4 shadow-xs">
                    <span className="text-[11px] font-medium text-[#71726c] uppercase">Indexed Documents</span>
                    <div className="text-2xl font-bold text-[#1c1d1a] mt-1">{files.length}</div>
                    <span className="text-[11px] text-[#526658] mt-1 block">Full text extracted & indexed</span>
                  </div>
                  <div className="bg-white border border-[#e5e5e0] rounded-lg p-4 shadow-xs">
                    <span className="text-[11px] font-medium text-[#71726c] uppercase">Permission Policy</span>
                    <div className="text-2xl font-bold text-[#1c1d1a] mt-1">
                      {files.filter(f => f.permissions.read).length} <span className="text-xs font-normal text-[#71726c]">/ {files.length} Permitted</span>
                    </div>
                    <span className="text-[11px] text-[#526658] mt-1 block">Server-enforced access</span>
                  </div>
                  <div className="bg-white border border-[#e5e5e0] rounded-lg p-4 shadow-xs">
                    <span className="text-[11px] font-medium text-[#71726c] uppercase">Tasks Executed</span>
                    <div className="text-2xl font-bold text-[#1c1d1a] mt-1">{tasks.length}</div>
                    <span className="text-[11px] text-[#526658] mt-1 block">With audit & verification</span>
                  </div>
                </div>

                {/* Demo Tasks Quick Launch */}
                <div className="bg-white border border-[#e5e5e0] rounded-lg p-5 shadow-xs">
                  <h3 className="text-xs font-semibold text-[#1c1d1a] uppercase tracking-wider mb-3">
                    Sample Natural-Language Directives
                  </h3>
                  <div className="space-y-2">
                    <div 
                      onClick={() => {
                        setTaskPrompt('Find the latest invoice from Acme Supplies, extract the invoice number, amount and due date, record it in our finance system, and confirm once completed.');
                        setActiveNav('tasks');
                      }}
                      className="p-3 bg-[#fbfbfa] hover:bg-[#f4f4f1] border border-[#e5e5e0] rounded text-xs cursor-pointer flex justify-between items-center transition"
                    >
                      <div>
                        <span className="font-semibold text-[#1c1d1a] block">1. Invoice Ingestion & Verified Ledger Persistence</span>
                        <span className="text-[#555650]">"Find the latest invoice from Acme Supplies, extract details, record in SQLite, and verify parity."</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#71726c]" />
                    </div>

                    <div 
                      onClick={() => {
                        setTaskPrompt('Read the employee handbook and summarize the annual leave policy, citing the source file.');
                        setActiveNav('tasks');
                      }}
                      className="p-3 bg-[#fbfbfa] hover:bg-[#f4f4f1] border border-[#e5e5e0] rounded text-xs cursor-pointer flex justify-between items-center transition"
                    >
                      <div>
                        <span className="font-semibold text-[#1c1d1a] block">2. Policy Ingestion & Source-Grounded Inquiry</span>
                        <span className="text-[#555650]">"Read the employee handbook and summarize the annual leave policy, citing the source file."</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#71726c]" />
                    </div>

                    <div 
                      onClick={() => {
                        setTaskPrompt('Compare the vendor contracts in this workspace and list differences in payment terms.');
                        setActiveNav('tasks');
                      }}
                      className="p-3 bg-[#fbfbfa] hover:bg-[#f4f4f1] border border-[#e5e5e0] rounded text-xs cursor-pointer flex justify-between items-center transition"
                    >
                      <div>
                        <span className="font-semibold text-[#1c1d1a] block">3. Multi-Document Contract Synthesis</span>
                        <span className="text-[#555650]">"Compare the vendor contracts in this workspace and list differences in payment terms."</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#71726c]" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: AI TASKS CONSOLE */}
            {activeNav === 'tasks' && (
              <div className="space-y-6">
                {/* Task Input Box */}
                <div className="bg-white border border-[#e5e5e0] rounded-lg p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[#526658] flex items-center">
                      <Terminal className="w-3.5 h-3.5 mr-1.5" /> Natural-Language Business Directive
                    </label>
                    <span className="text-[11px] text-[#71726c]">Enforcing file permissions for [{workspaces.find(w => w.id === currentWorkspaceId)?.name}]</span>
                  </div>

                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={taskPrompt}
                      onChange={(e) => setTaskPrompt(e.target.value)}
                      placeholder="Enter instruction for AI Employee..."
                      className="flex-1 bg-[#fbfbfa] border border-[#d8d8d0] rounded px-3 py-2 text-xs text-[#1c1d1a] placeholder-[#8f9087] focus:outline-none focus:ring-1 focus:ring-[#526658] transition"
                    />
                    <button
                      onClick={() => handleRunTask()}
                      disabled={isRunningTask}
                      className="px-4 py-2 bg-[#526658] hover:bg-[#435448] disabled:bg-[#8f9e94] text-white rounded text-xs font-medium flex items-center space-x-1.5 transition shadow-xs"
                    >
                      {isRunningTask ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Executing...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Run Task</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Human in the loop approval banner */}
                {taskDetail?.task.status === 'paused_approval' && taskDetail.approvals.find(a => a.status === 'pending') && (
                  <div className="bg-[#fef8ed] border border-[#f5dfb8] rounded-lg p-4 shadow-xs">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <AlertTriangle className="w-5 h-5 text-[#c28224] mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="text-xs font-semibold text-[#8a5b17]">Human Authorization Required</h4>
                          <p className="text-xs text-[#9c6a1e] mt-0.5">
                            {taskDetail.approvals.find(a => a.status === 'pending')?.prompt}
                          </p>
                          <div className="mt-2.5 flex items-center space-x-2">
                            <span className="text-xs text-[#555650]">Instruction / Due Date:</span>
                            <input
                              type="text"
                              value={approvalComment}
                              onChange={(e) => setApprovalComment(e.target.value)}
                              className="bg-white border border-[#e2cfb1] rounded px-2.5 py-1 text-xs text-[#1c1d1a] focus:outline-none w-72"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleResolveApproval(taskDetail.approvals.find(a => a.status === 'pending')!.id, false)}
                          className="px-3 py-1.5 bg-white border border-[#f0c2c2] hover:bg-[#fdf2f2] text-[#9b2c2c] rounded text-xs font-medium transition"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleResolveApproval(taskDetail.approvals.find(a => a.status === 'pending')!.id, true)}
                          className="px-3 py-1.5 bg-[#526658] hover:bg-[#435448] text-white rounded text-xs font-medium transition shadow-xs"
                        >
                          Authorize & Continue
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Task Execution Details */}
                {taskDetail && (
                  <div className="space-y-4">
                    {/* Goal & Interpretation Card */}
                    <div className="bg-white border border-[#e5e5e0] rounded-lg p-5 shadow-xs">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold text-[#526658] uppercase tracking-wider">
                          Interpreted Goal & Verification Criteria
                        </span>
                        {getStatusBadge(taskDetail.task.status)}
                      </div>
                      <h3 className="text-sm font-semibold text-[#1c1d1a] mb-2">{taskDetail.task.goal}</h3>

                      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#f0f0eb] text-xs">
                        <div>
                          <span className="text-[#71726c] font-medium block mb-1">Safety Constraints:</span>
                          <ul className="list-disc list-inside text-[#555650] space-y-0.5">
                            {taskDetail.task.constraints.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <span className="text-[#71726c] font-medium block mb-1">Completion Criteria:</span>
                          <ul className="list-disc list-inside text-[#555650] space-y-0.5">
                            {taskDetail.task.completionCriteria.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {taskDetail.task.summary && (
                        <div className="mt-4 p-3 bg-[#edf1ee] border border-[#d2ddd5] rounded text-xs text-[#334237]">
                          <span className="font-semibold block mb-0.5">Verified Final Outcome:</span>
                          {taskDetail.task.summary}
                        </div>
                      )}

                      {taskDetail.task.error && (
                        <div className="mt-4 p-3 bg-[#fdf2f2] border border-[#f5c6c6] rounded text-xs text-[#9b2c2c]">
                          <span className="font-semibold block mb-0.5">Execution Incident:</span>
                          {taskDetail.task.error}
                        </div>
                      )}
                    </div>

                    {/* Timeline of Steps */}
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-semibold text-[#71726c] uppercase tracking-wider">
                        Action Plan & Tool Invocations
                      </h4>

                      {taskDetail.actions.map(act => (
                        <div key={act.id} className="bg-white border border-[#e5e5e0] rounded-lg p-4 shadow-xs">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <span className="w-5 h-5 rounded-full bg-[#f4f4f1] text-[#555650] text-[11px] font-bold flex items-center justify-center">
                                {act.step_number}
                              </span>
                              <span className="font-mono text-xs font-semibold text-[#435448] bg-[#edf1ee] px-2 py-0.5 rounded border border-[#d2ddd5]">
                                {act.tool_name}
                              </span>
                              {act.retry_count > 0 && (
                                <span className="text-[10px] bg-[#f5ecfa] text-[#6b358a] px-1.5 py-0.5 rounded border border-[#e5cfee]">
                                  Retried {act.retry_count}x
                                </span>
                              )}
                            </div>
                            {getStatusBadge(act.status)}
                          </div>

                          <p className="text-xs text-[#555650] mb-2">{act.expected_outcome}</p>

                          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                            <div className="bg-[#fbfbfa] p-2.5 rounded border border-[#e5e5e0] overflow-x-auto">
                              <span className="text-[#888980] block mb-1 font-sans text-[10px] uppercase">Input Parameters:</span>
                              <pre className="text-[#1c1d1a]">{JSON.stringify(act.parameters, null, 2)}</pre>
                            </div>
                            <div className="bg-[#fbfbfa] p-2.5 rounded border border-[#e5e5e0] overflow-x-auto">
                              <span className="text-[#888980] block mb-1 font-sans text-[10px] uppercase">Observed Result:</span>
                              {act.output ? (
                                <pre className="text-[#435448]">{JSON.stringify(act.output, null, 2)}</pre>
                              ) : act.error ? (
                                <pre className="text-[#9b2c2c]">{act.error}</pre>
                              ) : (
                                <span className="text-[#888980] italic">Pending observation...</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 3: COMPANY DATA REPOSITORY */}
            {activeNav === 'data' && (
              <div className="space-y-6">
                {/* Upload Control Bar */}
                <div className="bg-white border border-[#e5e5e0] rounded-lg p-4 shadow-xs flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Search files by name..."
                      value={fileSearch}
                      onChange={(e) => setFileSearch(e.target.value)}
                      className="bg-[#fbfbfa] border border-[#d8d8d0] rounded px-3 py-1.5 text-xs text-[#1c1d1a] placeholder-[#8f9087] focus:outline-none focus:ring-1 focus:ring-[#526658] w-64"
                    />
                    <span className="text-xs text-[#71726c]">{filteredFiles.length} files</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Hidden inputs for multi-file, directory, and zip uploads */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      multiple
                      onChange={(e) => handleFileUpload(e, false)}
                      className="hidden"
                    />
                    <input
                      type="file"
                      ref={dirInputRef}
                      // @ts-expect-error directory attribute
                      webkitdirectory=""
                      directory=""
                      onChange={(e) => handleFileUpload(e, false)}
                      className="hidden"
                    />
                    <input
                      type="file"
                      ref={zipInputRef}
                      accept=".zip"
                      onChange={(e) => handleFileUpload(e, true)}
                      className="hidden"
                    />

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-3 py-1.5 bg-[#526658] hover:bg-[#435448] text-white rounded text-xs font-medium flex items-center transition shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      Upload Files
                    </button>

                    <button
                      onClick={() => dirInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-3 py-1.5 bg-white border border-[#d8d8d0] hover:bg-[#f4f4f1] text-[#1c1d1a] rounded text-xs font-medium flex items-center transition"
                    >
                      <Folder className="w-3.5 h-3.5 mr-1.5 text-[#526658]" />
                      Upload Directory
                    </button>

                    <button
                      onClick={() => zipInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-3 py-1.5 bg-white border border-[#d8d8d0] hover:bg-[#f4f4f1] text-[#1c1d1a] rounded text-xs font-medium flex items-center transition"
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5 text-[#526658]" />
                      Upload ZIP
                    </button>
                  </div>
                </div>

                {/* File List & Details Split View */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Files List Table */}
                  <div className="md:col-span-2 bg-white border border-[#e5e5e0] rounded-lg overflow-hidden shadow-xs">
                    <div className="p-3 border-b border-[#e5e5e0] bg-[#f7f7f4] flex justify-between items-center text-xs font-semibold text-[#50524c]">
                      <span>Document</span>
                      <span>Permissions & Status</span>
                    </div>

                    <div className="divide-y divide-[#f0f0eb] max-h-[550px] overflow-y-auto">
                      {filteredFiles.length === 0 ? (
                        <div className="p-8 text-center text-xs text-[#71726c]">
                          No company files found matching query.
                        </div>
                      ) : (
                        filteredFiles.map(f => (
                          <div 
                            key={f.id}
                            onClick={() => setSelectedFile(f)}
                            className={`p-3.5 flex items-center justify-between cursor-pointer transition ${
                              selectedFile?.id === f.id ? 'bg-[#edf1ee]' : 'hover:bg-[#fbfbfa]'
                            }`}
                          >
                            <div className="flex items-start space-x-2.5 overflow-hidden">
                              <File className="w-4 h-4 text-[#526658] mt-0.5 flex-shrink-0" />
                              <div className="truncate">
                                <span className="text-xs font-medium text-[#1c1d1a] block truncate">{f.filename}</span>
                                <span className="text-[10px] text-[#71726c] font-mono block truncate">{f.relativePath}</span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 flex-shrink-0">
                              <span className="text-[10px] font-mono bg-[#f4f4f1] text-[#555650] px-1.5 py-0.5 rounded border border-[#e5e5e0]">
                                {f.fileType}
                              </span>

                              {f.permissions.read ? (
                                <span className="text-[10px] text-[#435448] bg-[#edf1ee] px-1.5 py-0.5 rounded border border-[#d2ddd5] flex items-center">
                                  <Unlock className="w-3 h-3 mr-0.5 text-[#526658]" /> Read
                                </span>
                              ) : (
                                <span className="text-[10px] text-[#9b2c2c] bg-[#fdf2f2] px-1.5 py-0.5 rounded border border-[#f5c6c6] flex items-center">
                                  <Lock className="w-3 h-3 mr-0.5 text-[#c53030]" /> Denied
                                </span>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFile(f.id);
                                }}
                                className="p-1 text-[#888980] hover:text-[#9b2c2c] transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Selected File Details & Permissions Panel */}
                  <div className="bg-white border border-[#e5e5e0] rounded-lg p-4 shadow-xs space-y-4">
                    {selectedFile ? (
                      <>
                        <div className="border-b border-[#f0f0eb] pb-3">
                          <span className="text-[10px] font-semibold text-[#526658] uppercase">File Metadata</span>
                          <h4 className="text-xs font-bold text-[#1c1d1a] truncate mt-0.5">{selectedFile.filename}</h4>
                          <span className="text-[10px] text-[#71726c] font-mono block mt-0.5">{selectedFile.relativePath}</span>
                          <div className="flex items-center space-x-3 mt-2 text-[11px] text-[#555650]">
                            <span>Size: {(selectedFile.fileSize / 1024).toFixed(1)} KB</span>
                            <span>Uploaded: {new Date(selectedFile.uploadedAt).toLocaleTimeString()}</span>
                          </div>
                        </div>

                        {/* File Permissions Checkbox Matrix */}
                        <div>
                          <span className="text-[10px] font-semibold text-[#526658] uppercase block mb-2">
                            Granular Permissions
                          </span>
                          <div className="space-y-2 text-xs">
                            {(['read', 'extract', 'context', 'modify', 'export'] as const).map(pKey => (
                              <div key={pKey} className="flex items-center justify-between p-2 bg-[#fbfbfa] border border-[#e5e5e0] rounded">
                                <span className="capitalize font-medium text-[#1c1d1a]">{pKey} Permission</span>
                                <button
                                  onClick={() => handleTogglePermission(selectedFile.id, pKey)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                                    selectedFile.permissions[pKey]
                                      ? 'bg-[#edf1ee] text-[#435448] border-[#c5d5ca]'
                                      : 'bg-[#fdf2f2] text-[#9b2c2c] border-[#f5c6c6]'
                                  }`}
                                >
                                  {selectedFile.permissions[pKey] ? 'Allowed' : 'Denied'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Document Text Preview */}
                        <div>
                          <span className="text-[10px] font-semibold text-[#526658] uppercase block mb-1">
                            Extracted Content Preview
                          </span>
                          <pre className="p-2.5 bg-[#fbfbfa] border border-[#e5e5e0] rounded text-[10px] font-mono text-[#555650] max-h-48 overflow-y-auto whitespace-pre-wrap">
                            {selectedFile.extractedText || 'No text extracted.'}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <div className="p-8 text-center text-xs text-[#71726c]">
                        Select a file from the list to preview metadata and toggle permissions.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 4: PERMISSIONS GOVERNANCE MATRIX */}
            {activeNav === 'permissions' && (
              <div className="space-y-6">
                <div className="bg-white border border-[#e5e5e0] rounded-lg p-5 shadow-xs">
                  <div className="flex items-center space-x-2 text-[#526658] font-semibold text-sm mb-1">
                    <ShieldCheck className="w-5 h-5" />
                    <span>Server-Enforced File Permissions Governance</span>
                  </div>
                  <p className="text-xs text-[#555650] mb-4">
                    OperatorOS evaluates permissions inside each backend tool call. If access is revoked, the agent cannot inspect document contents and must explain the denial rather than speculating.
                  </p>

                  <div className="border border-[#e5e5e0] rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#f7f7f4] text-[#50524c] border-b border-[#e5e5e0]">
                        <tr>
                          <th className="p-3">File / Document</th>
                          <th className="p-3 text-center">Read</th>
                          <th className="p-3 text-center">Extract</th>
                          <th className="p-3 text-center">Context</th>
                          <th className="p-3 text-center">Modify</th>
                          <th className="p-3 text-center">Export</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0f0eb]">
                        {files.map(f => (
                          <tr key={f.id} className="hover:bg-[#fbfbfa] transition">
                            <td className="p-3 font-medium text-[#1c1d1a]">
                              <div>{f.filename}</div>
                              <div className="text-[10px] text-[#71726c] font-mono">{f.relativePath}</div>
                            </td>
                            {(['read', 'extract', 'context', 'modify', 'export'] as const).map(pKey => (
                              <td key={pKey} className="p-3 text-center">
                                <button
                                  onClick={() => handleTogglePermission(f.id, pKey)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                                    f.permissions[pKey]
                                      ? 'bg-[#edf1ee] text-[#435448] border-[#c5d5ca]'
                                      : 'bg-[#fdf2f2] text-[#9b2c2c] border-[#f5c6c6]'
                                  }`}
                                >
                                  {f.permissions[pKey] ? 'Allow' : 'Deny'}
                                </button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 5: EXECUTION HISTORY & AUDIT TRAIL */}
            {activeNav === 'history' && (
              <div className="space-y-6">
                <div className="bg-white border border-[#e5e5e0] rounded-lg p-5 shadow-xs space-y-4">
                  <div className="flex justify-between items-center border-b border-[#f0f0eb] pb-3">
                    <div>
                      <h3 className="text-xs font-semibold text-[#1c1d1a] uppercase tracking-wider">
                        Workspace Tasks & Audit Trail
                      </h3>
                      <span className="text-xs text-[#71726c]">Persistent records across server restarts</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {tasks.map(t => (
                      <div 
                        key={t.id}
                        onClick={() => {
                          setSelectedTaskId(t.id);
                          setActiveNav('tasks');
                        }}
                        className="p-3 border border-[#e5e5e0] rounded bg-[#fbfbfa] hover:bg-[#f4f4f1] cursor-pointer flex justify-between items-center transition"
                      >
                        <div>
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-mono text-xs text-[#71726c]">{t.id}</span>
                            {getStatusBadge(t.status)}
                          </div>
                          <span className="text-xs font-medium text-[#1c1d1a] block">{t.user_prompt}</span>
                          <span className="text-[10px] text-[#71726c] mt-0.5 block">{new Date(t.created_at).toLocaleString()}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#71726c]" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 6: SETTINGS */}
            {activeNav === 'settings' && (
              <div className="space-y-6">
                <div className="bg-white border border-[#e5e5e0] rounded-lg p-5 shadow-xs space-y-4 max-w-2xl">
                  <h3 className="text-xs font-semibold text-[#1c1d1a] uppercase tracking-wider">
                    Workspace & Engine Settings
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-xs text-[#71726c] block mb-1">Current Workspace</label>
                      <input 
                        type="text" 
                        readOnly 
                        value={workspaces.find(w => w.id === currentWorkspaceId)?.name || ''} 
                        className="w-full bg-[#fbfbfa] border border-[#d8d8d0] rounded px-3 py-2 text-xs text-[#1c1d1a]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#71726c] block mb-1">Workspace ID</label>
                      <input 
                        type="text" 
                        readOnly 
                        value={currentWorkspaceId} 
                        className="w-full bg-[#fbfbfa] border border-[#d8d8d0] rounded px-3 py-2 text-xs font-mono text-[#71726c]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#71726c] block mb-1">Database Mode</label>
                      <span className="px-2.5 py-1 bg-[#edf1ee] text-[#435448] rounded text-xs font-mono border border-[#c5d5ca]">
                        SQLite with WAL mode + foreign keys enabled
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* New Workspace Modal */}
      {showNewWsModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white border border-[#e5e5e0] rounded-lg p-5 max-w-md w-full shadow-lg space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-[#1c1d1a]">Create Named Workspace</h3>
              <button onClick={() => setShowNewWsModal(false)} className="text-[#71726c] hover:text-[#1c1d1a]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#50524c] mb-1 font-medium">Workspace Name</label>
                <input
                  type="text"
                  placeholder="e.g. Legal Operations or Q1 Audit"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  className="w-full bg-[#fbfbfa] border border-[#d8d8d0] rounded px-3 py-2 text-xs text-[#1c1d1a] focus:outline-none focus:ring-1 focus:ring-[#526658]"
                />
              </div>
              <div>
                <label className="block text-[#50524c] mb-1 font-medium">Description</label>
                <textarea
                  placeholder="Description of documents and scope..."
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-[#fbfbfa] border border-[#d8d8d0] rounded px-3 py-2 text-xs text-[#1c1d1a] focus:outline-none focus:ring-1 focus:ring-[#526658]"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2 border-t border-[#f0f0eb]">
              <button
                onClick={() => setShowNewWsModal(false)}
                className="px-3 py-1.5 bg-white border border-[#d8d8d0] hover:bg-[#f4f4f1] text-[#50524c] rounded text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkspace}
                className="px-3 py-1.5 bg-[#526658] hover:bg-[#435448] text-white rounded text-xs font-medium shadow-xs"
              >
                Create Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
