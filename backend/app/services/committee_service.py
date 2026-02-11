"""
Query by Committee (QBC) Service — binary classification only.

Trains RF + MLP alongside SVM to detect disagreement cases.
Simplified from interface version (removed multi-class methods).
"""

import numpy as np
import logging
from typing import Tuple, List, Dict, Optional
from dataclasses import dataclass
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler

from .pytorch_mlp import WeightedMLPClassifier

logger = logging.getLogger(__name__)


@dataclass
class CommitteePrediction:
    """Prediction result from the committee (binary)."""
    svm_prediction: int
    rf_prediction: int
    mlp_prediction: int
    vote_entropy: float


class CommitteeService:
    """RF + MLP committee for QBC active learning."""

    MIN_SAMPLES_PER_CLASS = 3

    def __init__(self):
        self._rf_model: Optional[RandomForestClassifier] = None
        self._mlp_model: Optional[WeightedMLPClassifier] = None
        self._scaler: Optional[StandardScaler] = None

    def train_committee(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        sample_weights: Optional[np.ndarray] = None,
    ) -> Tuple[Optional[RandomForestClassifier], Optional[WeightedMLPClassifier], Optional[StandardScaler]]:
        """Train RF and MLP models for committee."""
        n_positive = np.sum(y_train == 1)
        n_negative = np.sum(y_train == 0)

        if n_positive < self.MIN_SAMPLES_PER_CLASS or n_negative < self.MIN_SAMPLES_PER_CLASS:
            logger.warning(f"Insufficient samples: {n_positive} pos, {n_negative} neg")
            return None, None, None

        n_samples = len(y_train)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_train)

        rf_model = self._train_rf(X_scaled, y_train, sample_weights, n_samples)
        mlp_model = self._train_mlp(X_scaled, y_train, sample_weights, n_samples)

        self._rf_model = rf_model
        self._mlp_model = mlp_model
        self._scaler = scaler
        return rf_model, mlp_model, scaler

    def _train_rf(self, X, y, weights, n):
        try:
            n_est = max(10, min(100, n // 2))
            depth = min(5, max(2, int(np.log2(n + 1))))
            rf = RandomForestClassifier(
                n_estimators=n_est, max_depth=depth,
                class_weight="balanced", random_state=42, n_jobs=-1,
            )
            rf.fit(X, y, sample_weight=weights)
            return rf
        except Exception as e:
            logger.error(f"RF training failed: {e}")
            return None

    def _train_mlp(self, X, y, weights, n):
        try:
            hidden = (16,) if n < 20 else (32, 16)
            mlp = WeightedMLPClassifier(
                hidden_layer_sizes=hidden, alpha=0.01,
                max_iter=500, early_stopping=True, random_state=42,
            )
            mlp.fit(X, y, sample_weight=weights)
            return mlp
        except Exception as e:
            logger.error(f"MLP training failed: {e}")
            return None

    def predict_with_committee(
        self,
        X: np.ndarray,
        svm_scores: np.ndarray,
        rf_model: Optional[RandomForestClassifier],
        mlp_model: Optional[WeightedMLPClassifier],
        scaler: Optional[StandardScaler],
    ) -> Dict[int, CommitteePrediction]:
        """Get committee predictions and vote entropy."""
        n_samples = len(svm_scores)
        svm_preds = (svm_scores > 0).astype(int)
        results: Dict[int, CommitteePrediction] = {}

        if rf_model is None and mlp_model is None:
            for i in range(n_samples):
                results[i] = CommitteePrediction(
                    svm_prediction=int(svm_preds[i]),
                    rf_prediction=int(svm_preds[i]),
                    mlp_prediction=int(svm_preds[i]),
                    vote_entropy=0.0,
                )
            return results

        X_scaled = scaler.transform(X) if scaler is not None else X
        rf_preds = rf_model.predict(X_scaled).astype(int) if rf_model else svm_preds
        mlp_preds = mlp_model.predict(X_scaled).astype(int) if mlp_model else svm_preds

        for i in range(n_samples):
            votes = [int(svm_preds[i]), int(rf_preds[i]), int(mlp_preds[i])]
            counts = [votes.count(0), votes.count(1)]
            entropy = sum(-p / 3 * np.log2(p / 3) for p in counts if p > 0)
            results[i] = CommitteePrediction(
                svm_prediction=votes[0],
                rf_prediction=votes[1],
                mlp_prediction=votes[2],
                vote_entropy=float(entropy),
            )

        return results

    def get_vote_info_dict(
        self,
        item_ids: List[str],
        committee_predictions: Dict[int, CommitteePrediction],
    ) -> Dict[str, Dict]:
        """Convert committee predictions to API response format."""
        result = {}
        for idx, item_id in enumerate(item_ids):
            if idx in committee_predictions:
                pred = committee_predictions[idx]
                result[item_id] = {
                    "svm_prediction": pred.svm_prediction,
                    "rf_prediction": pred.rf_prediction,
                    "mlp_prediction": pred.mlp_prediction,
                    "vote_entropy": pred.vote_entropy,
                }
        return result
