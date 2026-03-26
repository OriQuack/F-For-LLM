from __future__ import annotations

import ast
from typing import Dict, List, Optional


AST_OVERRIDE_COLUMNS = [
    "function_count",
    "avg_function_len",
    "cyclomatic_complexity",
    "max_nesting_depth",
    "loop_count",
    "branch_count",
    "exception_count",
    "return_count",
]


def extract_ast_metrics(code: str, language: str) -> Dict[str, float]:
    language = (language or "").lower()
    if language != "python":
        return {}

    try:
        tree = ast.parse(code or "")
    except SyntaxError:
        return {}

    visitor = _PythonMetricVisitor()
    visitor.visit(tree)

    function_count = len(visitor.function_lengths)
    avg_function_len = (
        sum(visitor.function_lengths) / function_count
        if function_count > 0 else 0.0
    )

    return {
        "function_count": float(function_count),
        "avg_function_len": float(avg_function_len),
        "cyclomatic_complexity": float(visitor.cyclomatic_complexity),
        "max_nesting_depth": float(visitor.max_nesting_depth),
        "loop_count": float(visitor.loop_count),
        "branch_count": float(visitor.branch_count),
        "exception_count": float(visitor.exception_count),
        "return_count": float(visitor.return_count),
    }


class _PythonMetricVisitor(ast.NodeVisitor):
    def __init__(self):
        self.function_lengths: List[int] = []
        self.loop_count = 0
        self.branch_count = 0
        self.exception_count = 0
        self.return_count = 0
        self.cyclomatic_complexity = 1
        self.max_nesting_depth = 0
        self._nesting_depth = 0

    def _push_depth(self):
        self._nesting_depth += 1
        self.max_nesting_depth = max(self.max_nesting_depth, self._nesting_depth)

    def _pop_depth(self):
        self._nesting_depth = max(0, self._nesting_depth - 1)

    def _count_bool_ops(self, node: ast.AST):
        for sub in ast.walk(node):
            if isinstance(sub, ast.BoolOp):
                self.cyclomatic_complexity += max(1, len(sub.values) - 1)

    def visit_FunctionDef(self, node: ast.FunctionDef):
        if hasattr(node, "lineno") and hasattr(node, "end_lineno"):
            self.function_lengths.append(int(node.end_lineno - node.lineno + 1))
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        if hasattr(node, "lineno") and hasattr(node, "end_lineno"):
            self.function_lengths.append(int(node.end_lineno - node.lineno + 1))
        self.generic_visit(node)

    def visit_If(self, node: ast.If):
        self.branch_count += 1
        self.cyclomatic_complexity += 1
        self._count_bool_ops(node.test)
        self._push_depth()
        for child in node.body:
            self.visit(child)
        for child in node.orelse:
            self.visit(child)
        self._pop_depth()

    def visit_IfExp(self, node: ast.IfExp):
        self.branch_count += 1
        self.cyclomatic_complexity += 1
        self._count_bool_ops(node.test)
        self.generic_visit(node)

    def visit_For(self, node: ast.For):
        self.loop_count += 1
        self.cyclomatic_complexity += 1
        self._push_depth()
        for child in node.body:
            self.visit(child)
        for child in node.orelse:
            self.visit(child)
        self._pop_depth()

    def visit_AsyncFor(self, node: ast.AsyncFor):
        self.loop_count += 1
        self.cyclomatic_complexity += 1
        self._push_depth()
        for child in node.body:
            self.visit(child)
        for child in node.orelse:
            self.visit(child)
        self._pop_depth()

    def visit_While(self, node: ast.While):
        self.loop_count += 1
        self.cyclomatic_complexity += 1
        self._count_bool_ops(node.test)
        self._push_depth()
        for child in node.body:
            self.visit(child)
        for child in node.orelse:
            self.visit(child)
        self._pop_depth()

    def visit_Try(self, node: ast.Try):
        self.exception_count += 1
        self.cyclomatic_complexity += max(1, len(node.handlers))
        self._push_depth()
        for child in node.body:
            self.visit(child)
        for h in node.handlers:
            self.visit(h)
        for child in node.orelse:
            self.visit(child)
        for child in node.finalbody:
            self.visit(child)
        self._pop_depth()

    def visit_ExceptHandler(self, node: ast.ExceptHandler):
        self.exception_count += 1
        self.generic_visit(node)

    def visit_Return(self, node: ast.Return):
        self.return_count += 1
        self.generic_visit(node)

    def visit_Raise(self, node: ast.Raise):
        self.exception_count += 1
        self.generic_visit(node)

    def visit_With(self, node: ast.With):
        self._push_depth()
        self.generic_visit(node)
        self._pop_depth()

    def visit_AsyncWith(self, node: ast.AsyncWith):
        self._push_depth()
        self.generic_visit(node)
        self._pop_depth()

    def visit_Match(self, node: ast.Match):
        self.branch_count += max(1, len(node.cases))
        self.cyclomatic_complexity += max(1, len(node.cases))
        self._push_depth()
        self.generic_visit(node)
        self._pop_depth()