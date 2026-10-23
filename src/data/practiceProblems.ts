/**
 * The public part of the seeded practice problems: statement, input/output format, examples, starter programs and
 * the VISIBLE test cases. Hidden test cases are server-only (server/config/practiceProblemTests.ts) and must never be
 * added here: this module is part of the browser bundle.
 *
 * Every problem is judged as a complete program on standard input / standard output. Output is compared after
 * normalising line endings, trailing spaces on each line and trailing blank lines (src/execution/judgeCore.ts).
 * Starter programs already read the input and print the answer; only the marked function needs writing.
 */
import type { ExecutionLanguageId } from '../api/client';

export interface PublicPracticeProblem {
  problemId: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
  tags: string[];
  description: string;
  constraints: string[];
  examples: { input: string; output: string; explanation?: string }[];
  starterCode: Record<ExecutionLanguageId, string>;
  visibleTests: { input: string; expected: string }[];
}

export const PRACTICE_PROBLEMS: PublicPracticeProblem[] = [
  {
    problemId: 'p1',
    title: 'Two Sum',
    difficulty: 'Easy',
    category: 'Arrays',
    tags: ['Arrays', 'Hash Table'],
    description:
      'Given an array of integers nums and an integer target, find the indices of the two numbers that add up to target. Exactly one pair adds up to target.\n\n' +
      'Input: the first line holds n and target; the second line holds the n integers of nums.\n' +
      'Output: the two 0-based indices i and j (i < j), separated by a space.',
    constraints: ['2 <= n <= 10^4', '-10^9 <= nums[i], target <= 10^9', 'Exactly one valid answer exists.'],
    examples: [{ input: '4 9\n2 7 11 15', output: '0 1', explanation: 'nums[0] + nums[1] = 2 + 7 = 9.' }],
    starterCode: {
      c: `#include <stdio.h>
#include <stdlib.h>

/* Store the indices of the two numbers that add up to target in *i and *j (i < j). */
void twoSum(const int *nums, int n, int target, int *i, int *j) {
    /* Your code here */
    *i = -1;
    *j = -1;
}

int main(void) {
    int n, target;
    if (scanf("%d %d", &n, &target) != 2) return 1;
    int *nums = malloc(sizeof(int) * (n > 0 ? n : 1));
    for (int k = 0; k < n; k++) scanf("%d", &nums[k]);
    int i, j;
    twoSum(nums, n, target, &i, &j);
    printf("%d %d\\n", i, j);
    free(nums);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <vector>

using namespace std;

// Return the indices {i, j} (i < j) of the two numbers that add up to target.
vector<int> twoSum(const vector<int>& nums, int target) {
    // Your code here
    return {-1, -1};
}

int main() {
    int n, target;
    if (!(cin >> n >> target)) return 1;
    vector<int> nums(n);
    for (int& x : nums) cin >> x;
    vector<int> answer = twoSum(nums, target);
    cout << answer[0] << " " << answer[1] << endl;
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    // Return the indices {i, j} (i < j) of the two numbers that add up to target.
    static int[] twoSum(int[] nums, int target) {
        // Your code here
        return new int[] {-1, -1};
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        int target = in.nextInt();
        int[] nums = new int[n];
        for (int k = 0; k < n; k++) nums[k] = in.nextInt();
        int[] answer = twoSum(nums, target);
        System.out.println(answer[0] + " " + answer[1]);
    }
}
`,
      python: `import sys
from typing import List


def two_sum(nums: List[int], target: int) -> List[int]:
    """Return the indices [i, j] (i < j) of the two numbers that add up to target."""
    # Your code here
    return [-1, -1]


def main() -> None:
    data = sys.stdin.read().split()
    n, target = int(data[0]), int(data[1])
    nums = [int(x) for x in data[2:2 + n]]
    i, j = two_sum(nums, target)
    print(i, j)


main()
`,
    },
    visibleTests: [
      { input: '4 9\n2 7 11 15\n', expected: '0 1' },
      { input: '3 6\n3 2 4\n', expected: '1 2' },
    ],
  },
  {
    problemId: 'p2',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    category: 'Stack',
    tags: ['Stack', 'Strings'],
    description:
      'Given a string s containing only the characters `(`, `)`, `{`, `}`, `[` and `]`, determine whether it is valid: every open bracket is closed by the same type of bracket, in the correct order.\n\n' +
      'Input: one line holding s.\n' +
      'Output: true if s is valid, otherwise false.',
    constraints: ['1 <= s.length <= 10^4', 's consists of the characters ()[]{} only'],
    examples: [
      { input: '()[]{}', output: 'true' },
      { input: '(]', output: 'false' },
    ],
    starterCode: {
      c: `#include <stdio.h>

/* Return 1 if s is a valid bracket string, otherwise 0. */
int isValid(const char *s) {
    /* Your code here */
    return 0;
}

int main(void) {
    static char s[10002];
    if (scanf("%10001s", s) != 1) s[0] = '\\0';
    printf("%s\\n", isValid(s) ? "true" : "false");
    return 0;
}
`,
      cpp: `#include <iostream>
#include <string>

using namespace std;

// Return true if s is a valid bracket string.
bool isValid(const string& s) {
    // Your code here
    return false;
}

int main() {
    string s;
    cin >> s;
    cout << (isValid(s) ? "true" : "false") << endl;
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    // Return true if s is a valid bracket string.
    static boolean isValid(String s) {
        // Your code here
        return false;
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        String s = in.hasNext() ? in.next() : "";
        System.out.println(isValid(s) ? "true" : "false");
    }
}
`,
      python: `import sys


def is_valid(s: str) -> bool:
    """Return True if s is a valid bracket string."""
    # Your code here
    return False


def main() -> None:
    s = sys.stdin.readline().strip()
    print("true" if is_valid(s) else "false")


main()
`,
    },
    visibleTests: [
      { input: '()[]{}\n', expected: 'true' },
      { input: '(]\n', expected: 'false' },
    ],
  },
  {
    problemId: 'p3',
    title: 'Merge Two Sorted Lists',
    difficulty: 'Easy',
    category: 'Linked List',
    tags: ['Linked List', 'Recursion'],
    description:
      'You are given two linked lists sorted in non-decreasing order. Merge them into one sorted list by splicing their nodes together.\n\n' +
      'Input: two lines, one per list: the number of values k, followed by the k values in order (a line holding just 0 is an empty list).\n' +
      'Output: the values of the merged list on one line, separated by spaces (an empty line when both lists are empty).',
    constraints: ['0 <= k <= 50 for each list', '-100 <= value <= 100', 'Both lists are sorted in non-decreasing order'],
    examples: [{ input: '3 1 2 4\n3 1 3 4', output: '1 1 2 3 4 4' }],
    starterCode: {
      c: `#include <stdio.h>
#include <stdlib.h>

struct ListNode {
    int val;
    struct ListNode *next;
};

/* Merge the two sorted lists into one sorted list and return its head (reuse the nodes). */
struct ListNode *mergeTwoLists(struct ListNode *list1, struct ListNode *list2) {
    /* Your code here */
    return NULL;
}

static struct ListNode *readList(void) {
    int k;
    struct ListNode head = {0, NULL}, *tail = &head;
    if (scanf("%d", &k) != 1) return NULL;
    for (int i = 0; i < k; i++) {
        struct ListNode *node = malloc(sizeof *node);
        scanf("%d", &node->val);
        node->next = NULL;
        tail->next = node;
        tail = node;
    }
    return head.next;
}

int main(void) {
    struct ListNode *list1 = readList();
    struct ListNode *list2 = readList();
    struct ListNode *merged = mergeTwoLists(list1, list2);
    for (struct ListNode *node = merged; node; node = node->next) {
        printf(node == merged ? "%d" : " %d", node->val);
    }
    printf("\\n");
    return 0;
}
`,
      cpp: `#include <iostream>

using namespace std;

struct ListNode {
    int val;
    ListNode* next;
    ListNode(int v) : val(v), next(nullptr) {}
};

// Merge the two sorted lists into one sorted list and return its head (reuse the nodes).
ListNode* mergeTwoLists(ListNode* list1, ListNode* list2) {
    // Your code here
    return nullptr;
}

ListNode* readList() {
    int k = 0;
    cin >> k;
    ListNode head(0);
    ListNode* tail = &head;
    for (int i = 0; i < k; i++) {
        int v;
        cin >> v;
        tail->next = new ListNode(v);
        tail = tail->next;
    }
    return head.next;
}

int main() {
    ListNode* list1 = readList();
    ListNode* list2 = readList();
    ListNode* merged = mergeTwoLists(list1, list2);
    for (ListNode* node = merged; node; node = node->next) {
        if (node != merged) cout << " ";
        cout << node->val;
    }
    cout << endl;
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    static class ListNode {
        int val;
        ListNode next;
        ListNode(int val) { this.val = val; }
    }

    // Merge the two sorted lists into one sorted list and return its head (reuse the nodes).
    static ListNode mergeTwoLists(ListNode list1, ListNode list2) {
        // Your code here
        return null;
    }

    static ListNode readList(Scanner in) {
        int k = in.nextInt();
        ListNode head = new ListNode(0);
        ListNode tail = head;
        for (int i = 0; i < k; i++) {
            tail.next = new ListNode(in.nextInt());
            tail = tail.next;
        }
        return head.next;
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        ListNode list1 = readList(in);
        ListNode list2 = readList(in);
        StringBuilder out = new StringBuilder();
        for (ListNode node = mergeTwoLists(list1, list2); node != null; node = node.next) {
            if (out.length() > 0) out.append(' ');
            out.append(node.val);
        }
        System.out.println(out);
    }
}
`,
      python: `import sys
from typing import List, Optional


class ListNode:
    def __init__(self, val: int, next: "Optional[ListNode]" = None) -> None:
        self.val = val
        self.next = next


def merge_two_lists(list1: Optional[ListNode], list2: Optional[ListNode]) -> Optional[ListNode]:
    """Merge the two sorted lists into one sorted list and return its head (reuse the nodes)."""
    # Your code here
    return None


def build(values: List[int]) -> Optional[ListNode]:
    head: Optional[ListNode] = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head


def main() -> None:
    lines = sys.stdin.read().splitlines()
    lists = []
    for line in lines[:2]:
        numbers = [int(x) for x in line.split()]
        lists.append(build(numbers[1:1 + numbers[0]] if numbers else []))
    while len(lists) < 2:
        lists.append(None)
    values = []
    node = merge_two_lists(lists[0], lists[1])
    while node:
        values.append(str(node.val))
        node = node.next
    print(" ".join(values))


main()
`,
    },
    visibleTests: [
      { input: '3 1 2 4\n3 1 3 4\n', expected: '1 1 2 3 4 4' },
      { input: '0\n0\n', expected: '' },
    ],
  },
  {
    problemId: 'p4',
    title: 'Container With Most Water',
    difficulty: 'Medium',
    category: 'Arrays',
    tags: ['Arrays', 'Two Pointers', 'Greedy'],
    description:
      'You are given n vertical lines; line i has height height[i]. Find two lines that, together with the x-axis, form a container holding the most water, and return that amount (the distance between the lines times the lower height).\n\n' +
      'Input: the first line holds n; the second line holds the n heights.\n' +
      'Output: the maximum amount of water.',
    constraints: ['2 <= n <= 10^5', '0 <= height[i] <= 10^4'],
    examples: [{ input: '9\n1 8 6 2 5 4 8 3 7', output: '49', explanation: 'Lines 1 and 8 (heights 8 and 7) are 7 apart: 7 × 7 = 49.' }],
    starterCode: {
      c: `#include <stdio.h>
#include <stdlib.h>

/* Return the most water a container formed by two of the lines can hold. */
int maxArea(const int *height, int n) {
    /* Your code here */
    return 0;
}

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 1;
    int *height = malloc(sizeof(int) * (n > 0 ? n : 1));
    for (int i = 0; i < n; i++) scanf("%d", &height[i]);
    printf("%d\\n", maxArea(height, n));
    free(height);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <vector>

using namespace std;

// Return the most water a container formed by two of the lines can hold.
int maxArea(const vector<int>& height) {
    // Your code here
    return 0;
}

int main() {
    int n;
    if (!(cin >> n)) return 1;
    vector<int> height(n);
    for (int& h : height) cin >> h;
    cout << maxArea(height) << endl;
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    // Return the most water a container formed by two of the lines can hold.
    static int maxArea(int[] height) {
        // Your code here
        return 0;
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        int[] height = new int[n];
        for (int i = 0; i < n; i++) height[i] = in.nextInt();
        System.out.println(maxArea(height));
    }
}
`,
      python: `import sys
from typing import List


def max_area(height: List[int]) -> int:
    """Return the most water a container formed by two of the lines can hold."""
    # Your code here
    return 0


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    print(max_area([int(x) for x in data[1:1 + n]]))


main()
`,
    },
    visibleTests: [
      { input: '9\n1 8 6 2 5 4 8 3 7\n', expected: '49' },
      { input: '2\n1 1\n', expected: '1' },
    ],
  },
  {
    problemId: 'p5',
    title: 'Binary Tree Level Order Traversal',
    difficulty: 'Medium',
    category: 'Trees',
    tags: ['Trees', 'BFS'],
    description:
      "Given a binary tree, return its nodes' values level by level, from left to right.\n\n" +
      'Input: the first line holds t, the number of tokens; the second line holds the tree in level order as t tokens, where null marks a missing child (t = 0 is an empty tree).\n' +
      'Output: one line per level, with that level\'s values separated by spaces (nothing for an empty tree).',
    constraints: ['0 <= number of nodes <= 2000', '-1000 <= value <= 1000'],
    examples: [{ input: '7\n3 9 20 null null 15 7', output: '3\n9 20\n15 7' }],
    starterCode: {
      c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct TreeNode {
    int val;
    struct TreeNode *left, *right;
};

/* Print the values of each level on its own line, separated by spaces, from the top level down. */
void printLevelOrder(struct TreeNode *root) {
    /* Your code here */
}

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) t = 0;
    struct TreeNode **nodes = calloc(t > 0 ? t : 1, sizeof *nodes);
    char token[16];
    for (int i = 0; i < t && scanf("%15s", token) == 1; i++) {
        if (strcmp(token, "null") == 0) continue;
        nodes[i] = calloc(1, sizeof **nodes);
        nodes[i]->val = atoi(token);
    }
    /* link children in level order: each present node takes the next two tokens */
    int next = 1;
    for (int i = 0; i < t && next < t; i++) {
        if (!nodes[i]) continue;
        nodes[i]->left = nodes[next++];
        if (next < t) nodes[i]->right = nodes[next++];
    }
    printLevelOrder(t > 0 ? nodes[0] : NULL);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <queue>
#include <string>
#include <vector>

using namespace std;

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode(int v) : val(v), left(nullptr), right(nullptr) {}
};

// Return the values of each level, from the top level down, each level from left to right.
vector<vector<int>> levelOrder(TreeNode* root) {
    // Your code here
    return {};
}

int main() {
    int t = 0;
    cin >> t;
    vector<TreeNode*> nodes(t, nullptr);
    for (int i = 0; i < t; i++) {
        string token;
        cin >> token;
        if (token != "null") nodes[i] = new TreeNode(stoi(token));
    }
    // link children in level order: each present node takes the next two tokens
    int next = 1;
    for (int i = 0; i < t && next < t; i++) {
        if (!nodes[i]) continue;
        nodes[i]->left = nodes[next++];
        if (next < t) nodes[i]->right = nodes[next++];
    }
    for (const vector<int>& level : levelOrder(t > 0 ? nodes[0] : nullptr)) {
        for (size_t i = 0; i < level.size(); i++) cout << (i ? " " : "") << level[i];
        cout << endl;
    }
    return 0;
}
`,
      java: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
    static class TreeNode {
        int val;
        TreeNode left, right;
        TreeNode(int val) { this.val = val; }
    }

    // Return the values of each level, from the top level down, each level from left to right.
    static List<List<Integer>> levelOrder(TreeNode root) {
        // Your code here
        return new ArrayList<>();
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int t = in.hasNextInt() ? in.nextInt() : 0;
        TreeNode[] nodes = new TreeNode[t];
        for (int i = 0; i < t; i++) {
            String token = in.next();
            if (!token.equals("null")) nodes[i] = new TreeNode(Integer.parseInt(token));
        }
        // link children in level order: each present node takes the next two tokens
        int next = 1;
        for (int i = 0; i < t && next < t; i++) {
            if (nodes[i] == null) continue;
            nodes[i].left = nodes[next++];
            if (next < t) nodes[i].right = nodes[next++];
        }
        StringBuilder out = new StringBuilder();
        for (List<Integer> level : levelOrder(t > 0 ? nodes[0] : null)) {
            for (int i = 0; i < level.size(); i++) out.append(i > 0 ? " " : "").append(level.get(i));
            out.append('\\n');
        }
        System.out.print(out);
    }
}
`,
      python: `import sys
from typing import List, Optional


class TreeNode:
    def __init__(self, val: int) -> None:
        self.val = val
        self.left: "Optional[TreeNode]" = None
        self.right: "Optional[TreeNode]" = None


def level_order(root: Optional[TreeNode]) -> List[List[int]]:
    """Return the values of each level, from the top level down, each level from left to right."""
    # Your code here
    return []


def main() -> None:
    data = sys.stdin.read().split()
    t = int(data[0]) if data else 0
    tokens = data[1:1 + t]
    nodes = [None if tok == "null" else TreeNode(int(tok)) for tok in tokens]
    # link children in level order: each present node takes the next two tokens
    nxt = 1
    for node in nodes:
        if nxt >= len(nodes):
            break
        if node is None:
            continue
        node.left = nodes[nxt]
        nxt += 1
        if nxt < len(nodes):
            node.right = nodes[nxt]
            nxt += 1
    for level in level_order(nodes[0] if nodes else None):
        print(" ".join(str(v) for v in level))


main()
`,
    },
    visibleTests: [
      { input: '7\n3 9 20 null null 15 7\n', expected: '3\n9 20\n15 7' },
      { input: '1\n1\n', expected: '1' },
    ],
  },
];
