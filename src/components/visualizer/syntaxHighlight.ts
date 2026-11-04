/**
 * A small, display-only syntax highlighter for the visualizer's LIVE CODE panel (C++, C, Java and Python).
 *
 * It splits the WHOLE source into flat, non-overlapping tokens first and only then into lines, so a block comment or a
 * Python triple-quoted string that spans several lines is coloured correctly. Concatenating the tokens of a line always
 * gives back that line's exact text: highlighting never changes the code that is shown. The component renders tokens
 * as React text (never as HTML). The colours are the .live-code rules in index.css.
 */
export type TokenKind =
  | 'keyword'
  | 'type' // library types and class names
  | 'function' // a function's name where it is declared
  | 'call' // a function's name where it is called
  | 'variable'
  | 'number' // numbers and constants (true, null, None)
  | 'string'
  | 'operator'
  | 'punctuation' // ( ) [ ] { } ; , . : (normal text)
  | 'comment'
  | 'plain'; // whitespace

export interface SyntaxToken {
  kind: TokenKind;
  text: string;
}

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

/** keywords that name a type: a name right after one (or after a type) is being declared */
const C_TYPE_KEYWORDS = 'void int long short char float double signed unsigned bool auto const static inline struct';
const C_KEYWORDS = `${C_TYPE_KEYWORDS} if else for while do switch case default break continue return goto sizeof typedef union enum extern register volatile`;
const CPP_KEYWORDS =
  `${C_KEYWORDS} class public private protected virtual override final new delete this template typename namespace using ` +
  'operator friend explicit constexpr try catch throw noexcept mutable static_cast dynamic_cast const_cast reinterpret_cast';
const JAVA_TYPE_KEYWORDS = 'void int long short char float double boolean byte var static final public private protected abstract synchronized';
const JAVA_KEYWORDS =
  `${JAVA_TYPE_KEYWORDS} if else for while do switch case default break continue return class interface enum extends ` +
  'implements volatile transient native new this super try catch finally throw throws import package instanceof assert';
const PYTHON_KEYWORDS =
  'if elif else for while break continue return def class lambda pass in not and or is import from as with try except ' +
  'finally raise yield global nonlocal del assert async await';

interface LanguageRules {
  keywords: Set<string>;
  /** keywords after which an identifier followed by '(' is a declaration, not a call */
  declarators: Set<string>;
  types: Set<string>;
  constants: Set<string>;
  /** Capitalised names (TreeNode) are types */
  classNames: boolean;
}

const RULES: Record<string, LanguageRules> = {
  c: {
    keywords: words(C_KEYWORDS),
    declarators: words(C_TYPE_KEYWORDS),
    types: words('size_t FILE uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t'),
    constants: words('true false NULL'),
    classNames: false,
  },
  cpp: {
    keywords: words(CPP_KEYWORDS),
    declarators: words(`${C_TYPE_KEYWORDS} virtual explicit constexpr`),
    types: words(
      'std vector string map unordered_map set unordered_set pair queue deque stack priority_queue list array size_t ' +
        'tuple optional function'
    ),
    constants: words('true false NULL nullptr'),
    classNames: true,
  },
  java: {
    keywords: words(JAVA_KEYWORDS),
    declarators: words(JAVA_TYPE_KEYWORDS),
    types: words(
      'String Integer Long Double Boolean Character Object List ArrayList LinkedList Map HashMap TreeMap Set HashSet ' +
        'TreeSet Queue Deque ArrayDeque Stack PriorityQueue Arrays Collections Math System Scanner'
    ),
    constants: words('true false null'),
    classNames: true,
  },
  python: {
    keywords: words(PYTHON_KEYWORDS),
    declarators: words('def class'),
    types: words('int float str bool list dict set tuple object'),
    constants: words('True False None'),
    classNames: false,
  },
};

const PUNCTUATION = new Set(['(', ')', '[', ']', '{', '}', ';', ',', '.', ':']);

/** one alternative per token kind; the first that matches at the current position wins */
function tokenPattern(language: string): RegExp {
  const python = language === 'python';
  const comment = python ? String.raw`#[^\n]*` : String.raw`\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)`;
  const string = python
    ? String.raw`[rRbBfFuU]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)`
    : String.raw`"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?`;
  // C and C++ preprocessor lines: the directive and an <header> name
  const directive = language === 'c' || language === 'cpp' ? String.raw`#\s*[A-Za-z]+(?:\s*<[^>\n]*>)?` : '(?!)';
  const annotation = language === 'java' || python ? String.raw`@[A-Za-z_]\w*` : '(?!)';
  return new RegExp(
    `(?<comment>${comment})|(?<string>${string})|(?<directive>${directive})|(?<annotation>${annotation})|` +
      String.raw`(?<number>\b(?:0[xX][\da-fA-F']+|0[bB][01']+|\d[\d_']*\.?[\d_']*(?:[eE][+-]?\d+)?)[uUlLfFdD]*\b)|` +
      String.raw`(?<word>[A-Za-z_]\w*)|(?<space>\s+)|(?<op>::|->|<<=|>>=|&&|\|\||[-+*/%=!<>&|^]=|\+\+|--|\*\*|//|[^\w\s])`,
    'y'
  );
}

/**
 * Whether the identifier being classified (just before '(') is declared here: its previous significant token is a type
 * (int, void, def, TreeNode, vector<int>, int*, int[]), skipping pointer/reference marks, array brackets and one
 * template argument list.
 */
function isDeclaration(previous: SyntaxToken[], rules: LanguageRules): boolean {
  let i = previous.length - 1;
  const skipSpace = () => {
    while (i >= 0 && previous[i].kind === 'plain') i--;
  };
  skipSpace();
  // int* f(  int& f(  int[] f(
  while (i >= 0 && ['*', '&', '&&', ']', '['].includes(previous[i].text)) {
    i--;
    skipSpace();
  }
  // vector<int> f(  Map<String, List<Integer>> f(
  if (i >= 0 && (previous[i].text === '>' || previous[i].text === '>>')) {
    let depth = 0;
    for (; i >= 0; i--) {
      const t = previous[i].text;
      if (t === '>' || t === '>>') depth += t.length;
      else if (t === '<') depth -= 1;
      else if (t === '<<') depth -= 2;
      else if (!['plain', 'type', 'keyword', 'variable'].includes(previous[i].kind) && t !== ',' && t !== '::') return false;
      if (depth <= 0) break;
    }
    i--;
    skipSpace();
  }
  const before = previous[i];
  if (!before) return false;
  if (before.kind === 'type') return true;
  return before.kind === 'keyword' && rules.declarators.has(before.text);
}

/** Splits `source` into coloured tokens, one array per line (the result has one entry per '\n'-separated line). */
export function highlightLines(source: string, language: string): SyntaxToken[][] {
  const rules = RULES[language] ?? RULES.cpp;
  const pattern = tokenPattern(language);

  const tokens: SyntaxToken[] = [];
  const push = (kind: TokenKind, text: string) => {
    if (text) tokens.push({ kind, text });
  };

  let pos = 0;
  while (pos < source.length) {
    pattern.lastIndex = pos;
    const m = pattern.exec(source);
    if (!m || m[0] === '') {
      // unreachable in practice (op matches any single character); keep the text rather than loop
      push('punctuation', source[pos]);
      pos += 1;
      continue;
    }
    const g = m.groups ?? {};
    const text = m[0];
    pos += text.length;

    if (g.comment !== undefined) push('comment', text);
    else if (g.string !== undefined) push('string', text);
    else if (g.directive !== undefined) {
      const header = /^(#\s*[A-Za-z]+)(\s*)(<.*>)?$/.exec(text);
      if (header) {
        push('keyword', header[1]);
        push('plain', header[2]);
        push('string', header[3] ?? '');
      } else push('keyword', text);
    } else if (g.annotation !== undefined) push('keyword', text);
    else if (g.number !== undefined) push('number', text);
    else if (g.word !== undefined) {
      const calledOrDeclared = /^\s*\(/.test(source.slice(pos, pos + 40));
      if (rules.constants.has(text)) push('number', text);
      else if (rules.keywords.has(text)) push('keyword', text);
      else if (calledOrDeclared) push(isDeclaration(tokens, rules) ? 'function' : 'call', text);
      else if (rules.types.has(text)) push('type', text);
      else if (rules.classNames && /^[A-Z][a-z]\w*$/.test(text)) push('type', text);
      else push('variable', text);
    } else if (g.space !== undefined) push('plain', text);
    else push(PUNCTUATION.has(text) ? 'punctuation' : 'operator', text);
  }

  // split the token stream into lines, cutting multi-line tokens (block comments, triple-quoted strings) at each '\n'
  const lines: SyntaxToken[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ kind: token.kind, text: part });
    });
  }
  return lines;
}
