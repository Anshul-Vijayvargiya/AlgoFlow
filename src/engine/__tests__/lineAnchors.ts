/**
 * Language-neutral expectations for what each codeRef must highlight.
 * These are NOT copies of the code or of the line maps: each regex describes the
 * operation a codeRef stands for, and is applied to the text of whatever line the
 * REAL lineMap points at in the REAL code listing (C, C++, Java and Python).
 */
const FOR_I = /for\s*\(?\s*(int\s+)?i\b/;
const FOR_J = /for\s*\(?\s*(int\s+)?j\b/;

export const LINE_ANCHORS: Record<string, Record<string, RegExp>> = {
  'bubble-sort': {
    // n = len(arr) / int n = arr.size() / arr.length; in C n is a parameter of the signature
    'init-n': /\bn = (arr\.size\(\)|arr\.length|len\(arr\))|bubble_?sort\w*\(int arr\[\], int n\)/i,
    // Python returns arr; the C, C++ and Java functions are void and end without a return statement
    'fn-exit': /^\s*return arr\s*$|void bubble_?sort\w*\(/i,
    'outer-loop': FOR_I,
    'inner-loop': FOR_J,
    'compare-adjacent': /if\s*\(?\s*arr\[j\]\s*>\s*arr\[j \+ 1\]/,
    'if-greater': /if\s*\(?\s*arr\[j\]\s*>\s*arr\[j \+ 1\]/,
    'do-swap': /swap\(arr\[j\],\s*arr\[j \+ 1\]\)|int temp = arr\[j\]|arr\[j\],\s*arr\[j \+ 1\]\s*=/,
  },
  'selection-sort': {
    // n = len(arr) / int n = arr.size() / arr.length; in C n is a parameter of the signature
    'init-n': /\bn = (arr\.size\(\)|arr\.length|len\(arr\))|selection_?sort\w*\(int arr\[\], int n\)/i,
    // Python returns arr; the C, C++ and Java functions are void and end without a return statement
    'fn-exit': /^\s*return arr\s*$|void selection_?sort\w*\(/i,
    'outer-loop': FOR_I,
    'set-min': /min_?idx\s*=\s*i\b/i,
    'inner-loop': FOR_J,
    'compare-min': /if\s*\(?\s*arr\[j\]\s*<\s*arr\[min_?idx\]/i,
    'update-min': /min_?idx\s*=\s*j\b/i,
    'check-swap': /if\s*\(?\s*min_?idx\s*!=\s*i\b/i,
    'do-swap': /swap\(arr\[i\],\s*arr\[minIdx\]\)|int temp = arr\[i\]|arr\[i\],\s*arr\[min_idx\]\s*=/,
  },
  'insertion-sort': {
    // n = len(arr) / int n = arr.size() / arr.length; in C n is a parameter of the signature, and the Insertion Sort Python listing never names n
    'init-n': /\bn = (arr\.size\(\)|arr\.length|len\(arr\))|insertion_?sort\w*\(int arr\[\], int n\)|def insertion_sort\(arr\):/i,
    // Python returns arr; the C, C++ and Java functions are void and end without a return statement
    'fn-exit': /^\s*return arr\s*$|void insertion_?sort\w*\(/i,
    'outer-loop': FOR_I,
    'pick-key': /key = arr\[i\]/,
    'init-j': /\bj = i - 1/,
    'while-condition': /while\s*\(?\s*j >= 0/,
    'shift-right': /arr\[j \+ 1\] = arr\[j\]/,
    'decrement-j': /\bj(--| -= 1)/,
    'insert-key': /arr\[j \+ 1\] = key/,
  },
  'linear-search': {
    'fn-entry': /linear.?search/i,
    'init-i': FOR_I,
    'loop-condition': FOR_I,
    'increment-i': FOR_I,
    'compare-target': /if\s*\(?\s*arr\[i\]\s*==\s*target/,
    'if-match': /if\s*\(?\s*arr\[i\]\s*==\s*target/,
    'return-index': /return i\b/,
    'return-not-found': /return -1/,
  },
  'binary-search': {
    'fn-entry': /binary.?search/i,
    'init-bounds': /\blow\b.*\bhigh\b.*=/,
    'while-condition': /while\s*\(?\s*low <= high/,
    'calc-mid': /\bmid = low \+ \(high - low\)/,
    'check-equal': /arr\[mid\]\s*==\s*target/,
    'return-index': /return mid\b/,
    'check-less': /arr\[mid\]\s*<\s*target/,
    'update-low': /\blow = mid \+ 1/,
    'update-high': /\bhigh = mid - 1/,
    'return-not-found': /return -1/,
  },
  'merge-sort': {
    'fn-entry': /(void|def)\s+merge_?sort\s*\(/i,
    'base-case': /if\s*\(?\s*l >= r/,
    'base-return': /\breturn\b/,
    'split-range': /\bmid = l \+ \(r - l\)/,
    'call-left': /merge_?sort\(arr, l, mid\)/i,
    'call-right': /merge_?sort\(arr, mid \+ 1, r\)/i,
    'call-merge': /\bmerge\(arr, l, mid, r\)/,
    // C: the buffer's size statement opens its size / declare / copy range (see lineSpans)
    'make-left': /vector<int> left\b|int\[\] left\b|\bleft = arr\[|\bint n1 = m - l \+ 1;/,
    'make-right': /vector<int> right\b|int\[\] right\b|\bright = arr\[|\bint n2 = r - m;/,
    'init-merge': /\bi = 0, j = 0, k = l|\bi, j, k = 0, 0, l/,
    'merge-loop': /while\s*\(?\s*i < (left\.size\(\)|left\.length|n1|len\(left\)) (&&|and) j </,
    'compare-halves': /if\s*\(?\s*(left|L)\[i\]\s*<=\s*(right|R)\[j\]/,
    'copy-left': /arr\[k\+\+\]\s*=\s*(left|L)\[i\+\+\]|arr\[k\] = left\[i\]/,
    'copy-right': /arr\[k\+\+\]\s*=\s*(right|R)\[j\+\+\]|arr\[k\] = right\[j\]/,
    'left-loop': /while\s*\(?\s*i < (left\.size\(\)|left\.length|n1|len\(left\))\)?\s*(arr\[|:)/,
    'copy-remaining-left': /arr\[k\+\+\]\s*=\s*(left|L)\[i\+\+\]|arr\[k\] = left\[i\]/,
    'right-loop': /while\s*\(?\s*j < (right\.size\(\)|right\.length|n2|len\(right\))\)?\s*(arr\[|:)/,
    'copy-remaining-right': /arr\[k\+\+\]\s*=\s*(right|R)\[j\+\+\]|arr\[k\] = right\[j\]/,
    // Python: the update's own line; C, C++, Java: the post-increment inside arr[k++] = L[i++]
    'advance-i': /\bi\+\+|^\s*i \+= 1\s*$/,
    'advance-k-after-left': /\bk\+\+|^\s*k \+= 1\s*$/,
    'advance-j': /\bj\+\+|^\s*j \+= 1\s*$/,
    'advance-k-after-right': /\bk\+\+|^\s*k \+= 1\s*$/,
    'advance-i-rest': /\bi\+\+|^\s*i \+= 1\s*$/,
    'advance-k-left-rest': /\bk\+\+|^\s*k \+= 1\s*$/,
    'advance-j-rest': /\bj\+\+|^\s*j \+= 1\s*$/,
    'advance-k-right-rest': /\bk\+\+|^\s*k \+= 1\s*$/,
  },
  'quick-sort': {
    'fn-entry': /(void|def)\s+quick_?sort\s*\(/i,
    'range-check': /if\s*\(?\s*low < high/,
    'call-partition': /\bpi = partition\(arr, low, high\)/,
    'call-left': /quick_?sort\(arr, low, pi - 1\)/i,
    'call-right': /quick_?sort\(arr, pi \+ 1, high\)/i,
    'pick-pivot': /pivot = arr\[high\]/,
    'init-i': /\bi = low - 1/,
    'loop-j': FOR_J,
    'compare-pivot': /if\s*\(?\s*arr\[j\]\s*<=\s*pivot/,
    'inc-i': /\bi(\+\+| \+= 1)/,
    'swap-smaller': /swap\(arr\[i\],\s*arr\[j\]\)|int temp = arr\[i\];|arr\[i\],\s*arr\[j\]\s*=/,
    'place-pivot': /swap\(arr\[i \+ 1\],\s*arr\[high\]\)|int temp = arr\[i \+ 1\]|arr\[i \+ 1\],\s*arr\[high\]\s*=/,
    'return-pivot': /return i \+ 1/,
  },
  'two-pointer': {
    'fn-entry': /two.?sum.?sorted/i,
    'init-pointers': /\bleft\b.*\bright\b.*=/,
    'while-condition': /\bwhile \(?left < right\)?/,
    'calc-sum': /(sum|current_sum) = arr\[left\] \+ arr\[right\]/,
    'check-equal': /\bif \(?(sum|current_sum) == target\b/,
    'check-less': /\b(if|elif) \(?(sum|current_sum) < target\b/,
    'return-pair': /\breturn\b/,
    'increment-left': /\bleft(\+\+| \+= 1)/,
    'decrement-right': /\bright(--| -= 1)/,
    'return-none': /return (\{\}|false|None|new int\[\]\{\})/,
  },
};

/**
 * Mappings that are WRONG today (documented in docs/visualization-code-sync-audit.md P1-4).
 * The test treats this list as a ratchet: a mapping that fails its anchor and is not listed
 * fails the suite, and a listed mapping that starts passing also fails the suite so the
 * entry gets removed. Key format: `algorithm|language|codeRef`.
 */
export const KNOWN_LINE_MAP_DEFECTS: Record<string, string> = {};

/**
 * Terminal steps (found / not-found) must land on a line that returns.
 * Known violations (audit P1-4 / P2-8). Key: `algorithm|language|codeRef`.
 */
export const KNOWN_RETURN_LINE_DEFECTS: Record<string, string> = {};
