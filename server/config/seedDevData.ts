import { User } from '../models/User';
import { Problem } from '../models/Problem';
import { hashPassword } from '../services/authService';
import { env } from './env';

const INITIAL_PROBLEMS = [
  {
    problemId: 'p1',
    title: 'Two Sum',
    difficulty: 'Easy' as const,
    category: 'Arrays',
    tags: ['Arrays', 'Hash Table'],
    description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    starterCode: {
      cpp: 'class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Your code here\n    }\n};',
      c: 'int* twoSum(int* nums, int numsSize, int target, int* returnSize) {\n    // Your code here\n}',
      java: 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Your code here\n    }\n}',
      python: 'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass',
    },
    constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9', 'Only one valid answer exists.'],
    examples: [{ input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].' }],
    publicationStatus: 'published' as const,
    testCases: [
      { input: 'nums = [2,7,11,15], target = 9', expected: '[0,1]', isHidden: false },
      { input: 'nums = [3,2,4], target = 6', expected: '[1,2]', isHidden: false },
      { input: 'nums = [3,3], target = 6', expected: '[0,1]', isHidden: true },
    ],
  },
  {
    problemId: 'p2',
    title: 'Valid Parentheses',
    difficulty: 'Easy' as const,
    category: 'Stack',
    tags: ['Stack', 'Strings'],
    description: 'Given a string s containing characters `(`, `)`, `{`, `}`, `[` and `]`, determine if the input string is valid.',
    constraints: ['1 <= s.length <= 10^4', 's consists of parentheses only "()[]{}"'],
    examples: [{ input: 's = "()"', output: 'true' }],
    publicationStatus: 'published' as const,
    starterCode: {
      cpp: 'class Solution {\npublic:\n    bool isValid(string s) {\n        // Your code here\n    }\n};',
      c: 'bool isValid(char * s) {\n    // Your code here\n}',
      java: 'class Solution {\n    public boolean isValid(String s) {\n        // Your code here\n    }\n}',
      python: 'class Solution:\n    def isValid(self, s: str) -> bool:\n        pass',
    },
    testCases: [
      { input: 's = "()[]{}"', expected: 'true', isHidden: false },
      { input: 's = "(]"', expected: 'false', isHidden: false },
      { input: 's = "([)]"', expected: 'false', isHidden: true },
    ],
  },
  {
    problemId: 'p3',
    title: 'Merge Two Sorted Lists',
    difficulty: 'Easy' as const,
    category: 'Linked List',
    tags: ['Linked List', 'Recursion'],
    description: 'You are given the heads of two sorted linked lists list1 and list2. Merge the two lists into one sorted list.',
    constraints: ['0 <= list length <= 50', '-100 <= Node.val <= 100'],
    examples: [{ input: 'l1 = [1,2,4], l2 = [1,3,4]', output: '[1,1,2,3,4,4]' }],
    publicationStatus: 'published' as const,
    starterCode: {
      cpp: 'ListNode* mergeTwoLists(ListNode* list1, ListNode* list2) {\n    // Your code here\n}',
      c: 'struct ListNode* mergeTwoLists(struct ListNode* list1, struct ListNode* list2) {\n    // Your code here\n}',
      java: 'public ListNode mergeTwoLists(ListNode list1, ListNode list2) {\n    // Your code here\n}',
      python: 'def mergeTwoLists(self, list1: Optional[ListNode], list2: Optional[ListNode]) -> Optional[ListNode]:\n    pass',
    },
    testCases: [
      { input: 'l1 = [1,2,4], l2 = [1,3,4]', expected: '[1,1,2,3,4,4]', isHidden: false },
    ],
  },
  {
    problemId: 'p4',
    title: 'Container With Most Water',
    difficulty: 'Medium' as const,
    category: 'Arrays',
    tags: ['Arrays', 'Two Pointers', 'Greedy'],
    description: 'Find two lines that together with the x-axis form a container, such that the container contains the most water.',
    constraints: ['2 <= height.length <= 10^5', '0 <= height[i] <= 10^4'],
    examples: [{ input: 'height = [1,8,6,2,5,4,8,3,7]', output: '49' }],
    publicationStatus: 'published' as const,
    starterCode: {
      cpp: 'int maxArea(vector<int>& height) {\n    // Your code here\n}',
      c: 'int maxArea(int* height, int heightSize) {\n    // Your code here\n}',
      java: 'public int maxArea(int[] height) {\n    // Your code here\n}',
      python: 'def maxArea(self, height: List[int]) -> int:\n    pass',
    },
    testCases: [
      { input: 'height = [1,8,6,2,5,4,8,3,7]', expected: '49', isHidden: false },
    ],
  },
  {
    problemId: 'p5',
    title: 'Binary Tree Level Order Traversal',
    difficulty: 'Medium' as const,
    category: 'Trees',
    tags: ['Trees', 'BFS'],
    description: 'Given the root of a binary tree, return the level order traversal of its nodes values.',
    constraints: ['0 <= number of nodes <= 2000', '-1000 <= Node.val <= 1000'],
    examples: [{ input: 'root = [3,9,20,null,null,15,7]', output: '[[3],[9,20],[15,7]]' }],
    publicationStatus: 'published' as const,
    starterCode: {
      cpp: 'vector<vector<int>> levelOrder(TreeNode* root) {\n    // Your code here\n}',
      c: 'int** levelOrder(struct TreeNode* root, int* returnSize, int** returnColumnSizes) {\n    // Your code here\n}',
      java: 'public List<List<Integer>> levelOrder(TreeNode root) {\n    // Your code here\n}',
      python: 'def levelOrder(self, root: Optional[TreeNode]) -> List[List[int]]:\n    pass',
    },
    testCases: [
      { input: 'root = [3,9,20,null,null,15,7]', expected: '[[3],[9,20],[15,7]]', isHidden: false },
    ],
  },
];

/** Accounts with passwords committed in this file. They must never exist in a staging or production database. */
export const DEV_SEED_ACCOUNT_EMAILS = ['demo@algoflow.io', 'admin@algoflow.io', 'superadmin@algoflow.io'] as const;

/**
 * Development only (allow-list: staging, production, test and anything else are skipped). The fixed-password
 * ADMIN and SUPER_ADMIN accounts are additionally opt-in via SEED_DEV_ADMINS=true.
 */
export async function seedDevelopmentData(): Promise<void> {
  if (env.NODE_ENV !== 'development') return;

  try {
    // 1. Seed demo user for "Use demo credentials" button in AuthPage.tsx (development builds only)
    const demoUser = await User.findOne({ email: 'demo@algoflow.io' });
    if (!demoUser) {
      await User.create({
        name: 'Demo Engineer',
        email: 'demo@algoflow.io',
        passwordHash: await hashPassword('Demo1234!'),
        role: 'USER',
        accountStatus: 'active',
        streakDays: 14,
        solvedCount: 42,
        algorithmsLearned: 18,
      });
      console.log('🌱 Seeded development demo user: demo@algoflow.io');
    }

    if (env.SEED_DEV_ADMINS === 'true') {
      // 2. Seed admin user
      const adminUser = await User.findOne({ email: 'admin@algoflow.io' });
      if (!adminUser) {
        await User.create({
          name: 'System Admin',
          email: 'admin@algoflow.io',
          passwordHash: await hashPassword('Admin1234!'),
          role: 'ADMIN',
          accountStatus: 'active',
          streakDays: 30,
          solvedCount: 150,
          algorithmsLearned: 35,
        });
        console.log('🌱 Seeded development admin user: admin@algoflow.io');
      }

      // 3. Seed super admin user
      const superAdmin = await User.findOne({ email: 'superadmin@algoflow.io' });
      if (!superAdmin) {
        await User.create({
          name: 'Root Administrator',
          email: 'superadmin@algoflow.io',
          passwordHash: await hashPassword('SuperAdmin1234!'),
          role: 'SUPER_ADMIN',
          accountStatus: 'active',
          streakDays: 45,
          solvedCount: 220,
          algorithmsLearned: 40,
        });
        console.log('🌱 Seeded development super admin: superadmin@algoflow.io');
      }
    }

    // 4. Seed practice problems if collection is empty
    const problemCount = await Problem.countDocuments();
    if (problemCount === 0) {
      await Problem.insertMany(INITIAL_PROBLEMS);
      console.log(`🌱 Seeded ${INITIAL_PROBLEMS.length} initial practice problems into MongoDB.`);
    }
  } catch (error) {
    console.warn('⚠️ Development seeding warning (non-fatal):', error);
  }
}

/**
 * Strict environments refuse to start while a known development seed account exists (e.g. a database that was once
 * run in development mode): their passwords are public.
 */
export async function assertNoDevSeedAccounts(): Promise<void> {
  const found = await User.find({ email: { $in: [...DEV_SEED_ACCOUNT_EMAILS] } }).select('email').lean();
  if (found.length > 0) {
    const emails = found.map(u => u.email).join(', ');
    throw new Error(
      `Refusing to start: development seed accounts with public passwords exist in this database (${emails}). ` +
        'Delete them before running in staging or production.'
    );
  }
}
