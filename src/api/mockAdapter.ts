import type { ApiClient, UserProfile, NoteRecord, UserProgressData } from './client';
import { normalizeRole } from './client';
import type { PracticeProblem } from '../types/algorithm';


const INITIAL_PROBLEMS: PracticeProblem[] = [
  {
    id: 'p1',
    title: 'Two Sum',
    difficulty: 'Easy',
    category: 'Arrays',
    tags: ['Arrays', 'Hash Table'],
    solved: true,
    description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    starterCode: {
      cpp: 'class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Your code here\n    }\n};',
      c: 'int* twoSum(int* nums, int numsSize, int target, int* returnSize) {\n    // Your code here\n}',
      java: 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Your code here\n    }\n}',
      python: 'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass'
    },
    testCases: [
      { input: 'nums = [2,7,11,15], target = 9', expected: '[0,1]' },
      { input: 'nums = [3,2,4], target = 6', expected: '[1,2]' }
    ]
  },
  {
    id: 'p2',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    category: 'Stack',
    tags: ['Stack', 'Strings'],
    solved: true,
    description: 'Given a string s containing characters `(`, `)`, `{`, `}`, `[` and `]`, determine if the input string is valid.',
    starterCode: {
      cpp: 'class Solution {\npublic:\n    bool isValid(string s) {\n        // Your code here\n    }\n};',
      c: 'bool isValid(char * s) {\n    // Your code here\n}',
      java: 'class Solution {\n    public boolean isValid(String s) {\n        // Your code here\n    }\n}',
      python: 'class Solution:\n    def isValid(self, s: str) -> bool:\n        pass'
    },
    testCases: [
      { input: 's = "()[]{}"', expected: 'true' },
      { input: 's = "(]"', expected: 'false' }
    ]
  },
  {
    id: 'p3',
    title: 'Merge Two Sorted Lists',
    difficulty: 'Easy',
    category: 'Linked List',
    tags: ['Linked List', 'Recursion'],
    solved: false,
    description: 'You are given the heads of two sorted linked lists list1 and list2. Merge the two lists into one sorted list.',
    starterCode: {
      cpp: 'ListNode* mergeTwoLists(ListNode* list1, ListNode* list2) {\n    // Your code here\n}',
      c: 'struct ListNode* mergeTwoLists(struct ListNode* list1, struct ListNode* list2) {\n    // Your code here\n}',
      java: 'public ListNode mergeTwoLists(ListNode list1, ListNode list2) {\n    // Your code here\n}',
      python: 'def mergeTwoLists(self, list1: Optional[ListNode], list2: Optional[ListNode]) -> Optional[ListNode]:\n    pass'
    },
    testCases: [
      { input: 'l1 = [1,2,4], l2 = [1,3,4]', expected: '[1,1,2,3,4,4]' }
    ]
  },
  {
    id: 'p4',
    title: 'Container With Most Water',
    difficulty: 'Medium',
    category: 'Arrays',
    tags: ['Arrays', 'Two Pointers', 'Greedy'],
    solved: false,
    description: 'Find two lines that together with the x-axis form a container, such that the container contains the most water.',
    starterCode: {
      cpp: 'int maxArea(vector<int>& height) {\n    // Your code here\n}',
      c: 'int maxArea(int* height, int heightSize) {\n    // Your code here\n}',
      java: 'public int maxArea(int[] height) {\n    // Your code here\n}',
      python: 'def maxArea(self, height: List[int]) -> int:\n    pass'
    },
    testCases: [
      { input: 'height = [1,8,6,2,5,4,8,3,7]', expected: '49' }
    ]
  },
  {
    id: 'p5',
    title: 'Binary Tree Level Order Traversal',
    difficulty: 'Medium',
    category: 'Trees',
    tags: ['Trees', 'BFS'],
    solved: false,
    description: 'Given the root of a binary tree, return the level order traversal of its nodes values.',
    starterCode: {
      cpp: 'vector<vector<int>> levelOrder(TreeNode* root) {\n    // Your code here\n}',
      c: 'int** levelOrder(struct TreeNode* root, int* returnSize, int** returnColumnSizes) {\n    // Your code here\n}',
      java: 'public List<List<Integer>> levelOrder(TreeNode root) {\n    // Your code here\n}',
      python: 'def levelOrder(self, root: Optional[TreeNode]) -> List[List[int]]:\n    pass'
    },
    testCases: [
      { input: 'root = [3,9,20,null,null,15,7]', expected: '[[3],[9,20],[15,7]]' }
    ]
  },
];

const INITIAL_NOTES: NoteRecord[] = [
  {
    id: 'n1',
    title: 'Bubble Sort Key Optimization',
    content: 'If no swaps take place in an entire outer loop pass, the array is already sorted. We can exit early to achieve O(n) best-case time complexity.',
    algorithmId: 'bubble-sort',
    tags: ['Sorting', 'Optimization'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    title: 'Binary Search Mid Calculation Overflow',
    content: 'Always calculate mid using `low + (high - low) / 2` instead of `(low + high) / 2` to avoid integer overflow in languages with fixed integer widths like C, C++, and Java.',
    algorithmId: 'binary-search',
    tags: ['Searching', 'Trick'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

export class MockApiClient implements ApiClient {
  auth = {
    async login(email: string, _pass?: string): Promise<UserProfile> {
      const user: UserProfile = {
        id: 'u1',
        name: 'DSA Engineer',
        email,
        streakDays: 14,
        solvedCount: 42,
        algorithmsLearned: 18,
        progressPercent: 68,
        role: email?.includes('admin') ? 'ADMIN' : 'USER',
        accountStatus: 'active',
        preferences: {
          theme: 'dark',
          preferredLanguage: 'cpp',
          dailyGoalMinutes: 30,
        },
      };
      localStorage.setItem('algoflow_user', JSON.stringify(user));
      return user;
    },
    async register(name: string, email: string, _pass?: string): Promise<UserProfile> {
      const user: UserProfile = {
        id: 'u_' + Date.now(),
        name,
        email,
        streakDays: 1,
        solvedCount: 0,
        algorithmsLearned: 1,
        progressPercent: 5,
        role: 'USER',
        accountStatus: 'active',
        preferences: {
          theme: 'dark',
          preferredLanguage: 'cpp',
          dailyGoalMinutes: 30,
        },
      };
      localStorage.setItem('algoflow_user', JSON.stringify(user));
      return user;
    },
    async logout(): Promise<void> {
      localStorage.removeItem('algoflow_user');
    },
    async getCurrentUser(): Promise<UserProfile | null> {
      const saved = localStorage.getItem('algoflow_user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            ...parsed,
            role: normalizeRole(parsed.role),
            accountStatus: parsed.accountStatus || 'active',
            preferences: parsed.preferences || {
              theme: 'dark',
              preferredLanguage: 'cpp',
              dailyGoalMinutes: 30,
            },
          };
        } catch {
          return null;
        }
      }
      return {
        id: 'u1',
        name: 'Alex Chen',
        email: 'alex@algoflow.io',
        streakDays: 14,
        solvedCount: 42,
        algorithmsLearned: 18,
        progressPercent: 68,
        role: 'USER',
        accountStatus: 'active',
        preferences: {
          theme: 'dark',
          preferredLanguage: 'cpp',
          dailyGoalMinutes: 30,
        },
      };
    },
  };

  practice = {
    async getProblems(): Promise<{ problems: PracticeProblem[]; total: number; page: number; limit: number; totalPages: number }> {
      const saved = localStorage.getItem('algoflow_problems');
      const list = saved ? JSON.parse(saved) : INITIAL_PROBLEMS;
      if (!saved) localStorage.setItem('algoflow_problems', JSON.stringify(INITIAL_PROBLEMS));
      return {
        problems: list,
        total: list.length,
        page: 1,
        limit: list.length,
        totalPages: 1,
      };
    },
    async getProblemById(id: string): Promise<PracticeProblem | undefined> {
      const res = await this.getProblems();
      return res.problems.find((p) => p.id === id);
    },
    async submitSolution(problemId: string, _language?: string, _code?: string): Promise<{ passed: boolean; runtimeMs: number; memoryMb: number; message: string; submissionId?: string }> {
      const res = await this.getProblems();
      const updated = res.problems.map((p) => (p.id === problemId ? { ...p, solved: true } : p));
      localStorage.setItem('algoflow_problems', JSON.stringify(updated));
      return {
        passed: true,
        runtimeMs: Math.floor(Math.random() * 40) + 12,
        memoryMb: 14.2,
        message: 'All test cases passed successfully!',
        submissionId: 'sub_' + Date.now(),
      };
    },
    async getSubmissions(_problemId: string) {
      return [];
    },
  };

  progress = {
    async getUserProgress(): Promise<UserProgressData> {
      return {
        weeklyActivity: [
          { day: 'Mon', minutes: 45, steps: 120 },
          { day: 'Tue', minutes: 60, steps: 180 },
          { day: 'Wed', minutes: 30, steps: 90 },
          { day: 'Thu', minutes: 80, steps: 240 },
          { day: 'Fri', minutes: 65, steps: 195 },
          { day: 'Sat', minutes: 90, steps: 310 },
          { day: 'Sun', minutes: 75, steps: 220 },
        ],
        difficultyDistribution: [
          { name: 'Easy', value: 24, color: '#10B981' },
          { name: 'Medium', value: 14, color: '#F59E0B' },
          { name: 'Hard', value: 4, color: '#F43F5E' },
        ],
        topicProficiency: [
          { topic: 'Sorting', score: 90 },
          { topic: 'Searching', score: 85 },
          { topic: 'Arrays', score: 78 },
          { topic: 'Trees', score: 65 },
          { topic: 'Graphs', score: 55 },
          { topic: 'DP', score: 45 },
        ],
        streakDays: 14,
        solvedCount: 42,
        algorithmsLearned: 18,
        overallProgressPercent: 68,
      };
    },
    async getAlgorithmTracks() {
      return [];
    },
    async recordActivity(activity: any): Promise<UserProgressData> {
      const current = await this.getUserProgress();
      current.weeklyActivity[6].minutes += activity.minutes || 0;
      current.weeklyActivity[6].steps += activity.steps || 0;
      return current;
    },
    async updateAlgorithmProgress(algorithmId: string, data: any) {
      return {
        algorithmId,
        status: data.status || 'completed',
        stepsCompleted: data.stepsCompleted || 10,
        totalSteps: data.totalSteps || 10,
        lastStepIndex: data.lastStepIndex || 9,
        executionCount: 1,
        lastActivityAt: new Date().toISOString(),
      };
    },
  };

  notes = {
    async getNotes(): Promise<{ notes: NoteRecord[]; total: number; page: number; limit: number; totalPages: number }> {
      const saved = localStorage.getItem('algoflow_notes');
      const list = saved ? JSON.parse(saved) : INITIAL_NOTES;
      if (!saved) localStorage.setItem('algoflow_notes', JSON.stringify(INITIAL_NOTES));
      return {
        notes: list,
        total: list.length,
        page: 1,
        limit: list.length,
        totalPages: 1,
      };
    },
    async getNoteById(id: string): Promise<NoteRecord> {
      const { notes } = await this.getNotes();
      const n = notes.find((item) => item.id === id);
      if (!n) throw new Error('Note not found');
      return n;
    },
    async createNote(note: { title: string; content: string; tags?: string[]; algorithmId?: string }): Promise<NoteRecord> {
      const { notes } = await this.getNotes();
      const newNote: NoteRecord = {
        id: 'n_' + Date.now(),
        title: note.title,
        content: note.content,
        tags: note.tags || ['DSA'],
        algorithmId: note.algorithmId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      notes.unshift(newNote);
      localStorage.setItem('algoflow_notes', JSON.stringify(notes));
      return newNote;
    },
    async saveNote(note: Partial<NoteRecord> & { title: string; content: string }): Promise<NoteRecord> {
      if (note.id) {
        return this.updateNote(note.id, note);
      }
      return this.createNote(note);
    },
    async updateNote(id: string, note: any): Promise<NoteRecord> {
      const { notes } = await this.getNotes();
      const existing = notes.find((n) => n.id === id);
      if (!existing) throw new Error('Note not found');
      if (note.title !== undefined) existing.title = note.title;
      if (note.content !== undefined) existing.content = note.content;
      if (note.tags !== undefined) existing.tags = note.tags;
      if (note.algorithmId !== undefined) existing.algorithmId = note.algorithmId;
      existing.updatedAt = new Date().toISOString();
      localStorage.setItem('algoflow_notes', JSON.stringify(notes));
      return existing;
    },
    async deleteNote(id: string): Promise<void> {
      const { notes } = await this.getNotes();
      const filtered = notes.filter((n) => n.id !== id);
      localStorage.setItem('algoflow_notes', JSON.stringify(filtered));
    },
  };

  settings = {
    async getProfile(): Promise<UserProfile> {
      return (await mockApiClient.auth.getCurrentUser())!;
    },
    async updateProfile(data: any): Promise<UserProfile> {
      const current = await mockApiClient.settings.getProfile();
      if (data.name) current.name = data.name;
      if (data.preferences) current.preferences = { ...current.preferences, ...data.preferences };
      localStorage.setItem('algoflow_user', JSON.stringify(current));
      return current;
    },
  };


  admin = {
    async getMetrics(): Promise<any> {
      return {
        totalUsers: 10,
        totalProblems: 5,
        totalSubmissions: 30,
        activeUsersPastWeek: 8,
        serverUptimeSeconds: 3600,
        timestamp: new Date().toISOString(),
      };
    },
    async getUsers(): Promise<any> {
      return { users: [], total: 0, page: 1, limit: 10, totalPages: 1 };
    },
    async updateUserStatus(userId: string, status: any): Promise<any> {
      return { id: userId, accountStatus: status };
    },
    async updateUserRole(userId: string, role: any): Promise<any> {
      return { id: userId, role };
    },
    async getAuditLogs(): Promise<any> {
      return { logs: [], total: 0, page: 1, limit: 10, totalPages: 1 };
    },
    async createProblem(p: any): Promise<any> {
      return p;
    },
    async updateProblem(_id: string, p: any): Promise<any> {
      return p;
    },
    async deleteProblem(_id: string): Promise<void> {},
  };
}

export const mockApiClient = new MockApiClient();
export const apiClient = mockApiClient;


