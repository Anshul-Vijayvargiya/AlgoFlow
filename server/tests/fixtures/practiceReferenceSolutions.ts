import type { ExecutionLanguageId } from '../../../src/api/client';

/**
 * Reference solutions for the seeded practice problems, used only by tests. Each one replaces the stub in the
 * problem's starter program (`stub` must occur exactly once), so a solution always runs inside the exact program a
 * user is given.
 */
export const REFERENCE_SOLUTIONS: Record<string, Record<ExecutionLanguageId, { stub: string; solution: string }>> = {
  p1: {
    c: {
      stub: '    /* Your code here */\n    *i = -1;\n    *j = -1;\n',
      solution: `    for (int a = 0; a < n; a++)
        for (int b = a + 1; b < n; b++)
            if (nums[a] + nums[b] == target) { *i = a; *j = b; return; }
    *i = -1;
    *j = -1;
`,
    },
    cpp: {
      stub: '    // Your code here\n    return {-1, -1};\n',
      solution: `    for (int a = 0; a < (int)nums.size(); a++)
        for (int b = a + 1; b < (int)nums.size(); b++)
            if (nums[a] + nums[b] == target) return {a, b};
    return {-1, -1};
`,
    },
    java: {
      stub: '        // Your code here\n        return new int[] {-1, -1};\n',
      solution: `        for (int a = 0; a < nums.length; a++)
            for (int b = a + 1; b < nums.length; b++)
                if (nums[a] + nums[b] == target) return new int[] {a, b};
        return new int[] {-1, -1};
`,
    },
    python: {
      stub: '    # Your code here\n    return [-1, -1]\n',
      solution: `    seen = {}
    for j, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], j]
        seen.setdefault(x, j)
    return [-1, -1]
`,
    },
  },
  p2: {
    c: {
      stub: '    /* Your code here */\n    return 0;\n',
      solution: `    static char stack[10002];
    int top = 0;
    for (const char *p = s; *p; p++) {
        char c = *p;
        if (c == '(' || c == '[' || c == '{') { stack[top++] = c; continue; }
        if (top == 0) return 0;
        char o = stack[--top];
        if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{')) return 0;
    }
    return top == 0;
`,
    },
    cpp: {
      stub: '    // Your code here\n    return false;\n',
      solution: `    string stack;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') { stack.push_back(c); continue; }
        if (stack.empty()) return false;
        char o = stack.back();
        stack.pop_back();
        if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{')) return false;
    }
    return stack.empty();
`,
    },
    java: {
      stub: '        // Your code here\n        return false;\n',
      solution: `        char[] stack = new char[s.length()];
        int top = 0;
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') { stack[top++] = c; continue; }
            if (top == 0) return false;
            char o = stack[--top];
            if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{')) return false;
        }
        return top == 0;
`,
    },
    python: {
      stub: '    # Your code here\n    return False\n',
      solution: `    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for c in s:
        if c in "([{":
            stack.append(c)
        elif not stack or stack.pop() != pairs[c]:
            return False
    return not stack
`,
    },
  },
  p3: {
    c: {
      stub: '    /* Your code here */\n    return NULL;\n',
      solution: `    struct ListNode head = {0, NULL}, *tail = &head;
    while (list1 && list2) {
        if (list1->val <= list2->val) { tail->next = list1; list1 = list1->next; }
        else { tail->next = list2; list2 = list2->next; }
        tail = tail->next;
    }
    tail->next = list1 ? list1 : list2;
    return head.next;
`,
    },
    cpp: {
      stub: '    // Your code here\n    return nullptr;\n',
      solution: `    ListNode head(0);
    ListNode* tail = &head;
    while (list1 && list2) {
        if (list1->val <= list2->val) { tail->next = list1; list1 = list1->next; }
        else { tail->next = list2; list2 = list2->next; }
        tail = tail->next;
    }
    tail->next = list1 ? list1 : list2;
    return head.next;
`,
    },
    java: {
      stub: '        // Your code here\n        return null;\n',
      solution: `        ListNode head = new ListNode(0);
        ListNode tail = head;
        while (list1 != null && list2 != null) {
            if (list1.val <= list2.val) { tail.next = list1; list1 = list1.next; }
            else { tail.next = list2; list2 = list2.next; }
            tail = tail.next;
        }
        tail.next = list1 != null ? list1 : list2;
        return head.next;
`,
    },
    python: {
      stub: '    # Your code here\n    return None\n',
      solution: `    head = ListNode(0)
    tail = head
    while list1 and list2:
        if list1.val <= list2.val:
            tail.next, list1 = list1, list1.next
        else:
            tail.next, list2 = list2, list2.next
        tail = tail.next
    tail.next = list1 or list2
    return head.next
`,
    },
  },
  p4: {
    c: {
      stub: '    /* Your code here */\n    return 0;\n',
      solution: `    int best = 0, l = 0, r = n - 1;
    while (l < r) {
        int h = height[l] < height[r] ? height[l] : height[r];
        if (h * (r - l) > best) best = h * (r - l);
        if (height[l] < height[r]) l++; else r--;
    }
    return best;
`,
    },
    cpp: {
      stub: '    // Your code here\n    return 0;\n',
      solution: `    int best = 0, l = 0, r = (int)height.size() - 1;
    while (l < r) {
        best = max(best, min(height[l], height[r]) * (r - l));
        if (height[l] < height[r]) l++; else r--;
    }
    return best;
`,
    },
    java: {
      stub: '        // Your code here\n        return 0;\n',
      solution: `        int best = 0, l = 0, r = height.length - 1;
        while (l < r) {
            best = Math.max(best, Math.min(height[l], height[r]) * (r - l));
            if (height[l] < height[r]) l++; else r--;
        }
        return best;
`,
    },
    python: {
      stub: '    # Your code here\n    return 0\n',
      solution: `    best, l, r = 0, 0, len(height) - 1
    while l < r:
        best = max(best, min(height[l], height[r]) * (r - l))
        if height[l] < height[r]:
            l += 1
        else:
            r -= 1
    return best
`,
    },
  },
  p5: {
    c: {
      stub: '    /* Your code here */\n',
      solution: `    if (!root) return;
    struct TreeNode **queue = malloc(sizeof *queue * 4096);
    int head = 0, tail = 0;
    queue[tail++] = root;
    while (head < tail) {
        int end = tail;
        for (int i = head; i < end; i++) {
            struct TreeNode *node = queue[i];
            printf(i == head ? "%d" : " %d", node->val);
            if (node->left) queue[tail++] = node->left;
            if (node->right) queue[tail++] = node->right;
        }
        printf("\\n");
        head = end;
    }
    free(queue);
`,
    },
    cpp: {
      stub: '    // Your code here\n    return {};\n',
      solution: `    vector<vector<int>> levels;
    if (!root) return levels;
    queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        vector<int> level;
        for (size_t n = q.size(); n > 0; n--) {
            TreeNode* node = q.front();
            q.pop();
            level.push_back(node->val);
            if (node->left) q.push(node->left);
            if (node->right) q.push(node->right);
        }
        levels.push_back(level);
    }
    return levels;
`,
    },
    java: {
      stub: '        // Your code here\n        return new ArrayList<>();\n',
      solution: `        List<List<Integer>> levels = new ArrayList<>();
        List<TreeNode> current = new ArrayList<>();
        if (root != null) current.add(root);
        while (!current.isEmpty()) {
            List<Integer> level = new ArrayList<>();
            List<TreeNode> next = new ArrayList<>();
            for (TreeNode node : current) {
                level.add(node.val);
                if (node.left != null) next.add(node.left);
                if (node.right != null) next.add(node.right);
            }
            levels.add(level);
            current = next;
        }
        return levels;
`,
    },
    python: {
      stub: '    # Your code here\n    return []\n',
      solution: `    levels = []
    current = [root] if root else []
    while current:
        levels.append([node.val for node in current])
        current = [child for node in current for child in (node.left, node.right) if child]
    return levels
`,
    },
  },
};
