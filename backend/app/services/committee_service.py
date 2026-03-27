"""
Query by Committee (QBC) Service — binary classification only.

Trains RF + MLP alongside SVM to detect disagreement cases.
Uses balanced sample weights and 5-tier adaptive MLP configuration.
"""

import numpy as np
import logging
from typing import Tuple, List, Dict, Optional
from dataclasses import dataclass
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler

from .pytorch_mlp import WeightedMLPClassifier
from .svm_utils import compute_balanced_sample_weights

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
        feature_names: Optional[List[str]] = None,
        skip_scaling: bool = False,
    ) -> Tuple[Optional[RandomForestClassifier], Optional[WeightedMLPClassifier], Optional[StandardScaler], Optional[Dict[str, float]]]:
        """Train RF and MLP models for committee.

        Args:
            X_train: Training feature matrix (N_samples, N_features)
            y_train: Training labels (N_samples,) with values 0 or 1
            sample_weights: Optional sample weights (N_samples,)
            feature_names: Optional feature names for RF importance extraction
            skip_scaling: If True, skip StandardScaler (data already scaled)

        Returns:
            Tuple of (rf, mlp, scaler, feature_importances)
        """
        n_positive = np.sum(y_train == 1)
        n_negative = np.sum(y_train == 0)

        if n_positive < self.MIN_SAMPLES_PER_CLASS or n_negative < self.MIN_SAMPLES_PER_CLASS:
            logger.warning(f"Insufficient samples: {n_positive} pos, {n_negative} neg")
            return None, None, None, None

        n_samples = len(y_train)

        # Scale features (important for MLP) — skip if already scaled
        if skip_scaling:
            scaler = None
            X_scaled = X_train
        else:
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X_train)

        rf_model = self._train_rf(X_scaled, y_train, sample_weights, n_samples)
        mlp_model = self._train_mlp(X_scaled, y_train, sample_weights, n_samples)

        # Extract RF feature importances
        feature_importances = None
        if rf_model is not None and feature_names is not None:
            feature_importances = dict(zip(feature_names, rf_model.feature_importances_.tolist()))

        self._rf_model = rf_model
        self._mlp_model = mlp_model
        self._scaler = scaler
        return rf_model, mlp_model, scaler, feature_importances

    def _train_rf(self, X, y, weights, n):
        try:
            n_est = max(50, min(300, n * 2))
            depth = min(5, max(2, int(np.log2(n + 1))))

            # Balance by weighted class mass (not raw counts like sklearn's class_weight='balanced')
            balanced_weights = weights
            if weights is not None:
                balanced_weights = compute_balanced_sample_weights(y, weights)

            rf = RandomForestClassifier(
                n_estimators=n_est, max_depth=depth,
                random_state=42, n_jobs=-1,
            )
            rf.fit(X, y, sample_weight=balanced_weights)

            logger.info(f"RF trained: n_estimators={n_est}, max_depth={depth}")
            return rf
        except Exception as e:
            logger.error(f"RF training failed: {e}")
            return None

    @staticmethod
    def _select_mlp_config(n_samples: int) -> dict:
        """Select MLP architecture based on sample count.

        5-tier system:
          Tier 1 (N<30):     (6,)      WD=1e-2  DO=0.0  ES=off  max_iter=300
          Tier 2 (30-100):   (12,)     WD=5e-3  DO=0.0  ES=on if N>=50
          Tier 3 (100-400):  (16, 8)   WD=5e-4  DO=0.0  ES=on
          Tier 4 (400-1500): (32, 16)  WD=1e-4  DO=0.2  ES=on
          Tier 5 (1500+):    (64, 32)  WD=1e-4  DO=0.2  ES=on
        """
        if n_samples < 30:
            return dict(
                tier=1, hidden_layer_sizes=(6,), alpha=1e-2,
                dropout=0.0, early_stopping=False, max_iter=300,
            )
        elif n_samples < 100:
            return dict(
                tier=2, hidden_layer_sizes=(12,), alpha=5e-3,
                dropout=0.0, early_stopping=(n_samples >= 50), max_iter=500,
            )
        elif n_samples < 400:
            return dict(
                tier=3, hidden_layer_sizes=(16, 8), alpha=5e-4,
                dropout=0.0, early_stopping=True, max_iter=500,
            )
        elif n_samples < 1500:
            return dict(
                tier=4, hidden_layer_sizes=(32, 16), alpha=1e-4,
                dropout=0.2, early_stopping=True, max_iter=500,
            )
        else:
            return dict(
                tier=5, hidden_layer_sizes=(64, 32), alpha=1e-4,
                dropout=0.2, early_stopping=True, max_iter=500,
            )

    def _train_mlp(self, X, y, weights, n):
        try:
            cfg = self._select_mlp_config(n)
            tier = cfg.pop("tier")

            # Balance by weighted class mass (consistent with SVM and RF)
            balanced_weights = weights
            if weights is not None:
                balanced_weights = compute_balanced_sample_weights(y, weights)

            mlp = WeightedMLPClassifier(
                **cfg,
                validation_fraction=0.2,
                n_iter_no_change=10,
                random_state=42,
            )
            mlp.fit(X, y, sample_weight=balanced_weights)

            logger.info(
                f"MLP Tier {tier}: layers={cfg['hidden_layer_sizes']}, "
                f"WD={cfg['alpha']}, DO={cfg['dropout']}, "
                f"ES={'on' if cfg['early_stopping'] else 'off'}, "
                f"iters={mlp.n_iter_}/{cfg['max_iter']}"
            )
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
