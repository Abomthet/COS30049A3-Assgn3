"""The names of the nine methods as the web application shows them (Mod-21).

Assignment 2's `explain.METHOD_NAMES` holds long names ("Robust z baseline (A1)", "Score fusion (two methods, one flag
budget)"). The screens show the short name; the Models page also shows the long one. Both are kept here, keyed by the
method id, and every response that carries a name goes through `short_name` (the schemas call it), so no path can send A2's
text. The keys are checked against A2's table when the module loads: a method A2 adds without a name here stops the start.
"""
from __future__ import annotations

from explorer.explain import METHOD_NAMES, check_wording

SHORT_NAMES: dict[str, str] = {
    "baseline": "Baseline", "isolation_forest": "Isolation Forest", "lof": "Local outlier", "kmeans": "K-Means",
    "dbscan": "DBSCAN", "regression": "Regression", "regression_interval": "Regression range", "fusion": "Fusion",
    "txgpt_method": "TxGPT",
}
LONG_NAMES: dict[str, str] = {
    "baseline": "Robust z baseline", "isolation_forest": "Isolation Forest", "lof": "Local Outlier Factor",
    "kmeans": "K-Means distance", "dbscan": "DBSCAN noise", "regression": "Regression residual",
    "regression_interval": "Regression expected range", "fusion": "Score fusion (Regression + Isolation Forest)",
    "txgpt_method": "TxGPT surprisal",
}

if set(SHORT_NAMES) != set(METHOD_NAMES) or set(LONG_NAMES) != set(METHOD_NAMES):
    raise RuntimeError("app/core/method_names.py must name exactly the methods of explorer.explain.METHOD_NAMES.")
for _name in (*SHORT_NAMES.values(), *LONG_NAMES.values()):
    check_wording(_name)  # the wording rule (A1 NFR-01) holds for these names as it does for A2's


def short_name(method_id: str, fallback: str | None = None) -> str:
    """The short name of a method; `fallback` (or the id) for an id the table does not know."""
    return SHORT_NAMES.get(method_id, fallback or method_id)


def long_name(method_id: str, fallback: str | None = None) -> str:
    """The long name, for the Models page."""
    return LONG_NAMES.get(method_id, fallback or method_id)
