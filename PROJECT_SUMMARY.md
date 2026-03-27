# 코드 저작자 분류기 (Code Authorship Classifier) — 프로젝트 요약

## 가) 제안배경 및 필요성

### 배경

대규모 언어 모델(LLM)의 급격한 발전으로 GPT-4, DeepSeek, Qwen 등이 인간과 거의 구분이 안 되는 수준의 코드를 생성하게 되었다. 이에 따라 교육, 오픈소스 기여, 보안 감사, 지적재산권 등 다양한 영역에서 **"이 코드를 사람이 작성했는가, LLM이 생성했는가"**를 판별해야 하는 필요성이 대두되고 있다.

### 필요성

1. **교육 현장의 학습 무결성**: 프로그래밍 과제에서 LLM 생성 코드의 무분별한 제출을 탐지해야 한다.
2. **오픈소스 기여 검증**: AI가 생성한 코드의 라이선스 및 품질 문제를 사전에 식별해야 한다.
3. **보안 감사**: LLM이 생성한 코드에서 발생할 수 있는 보안 취약점 패턴을 조기에 인지해야 한다.
4. **기존 접근법의 한계**: 단순 자동 분류기(fully supervised)는 레이블 데이터 확보 비용이 높고, 새로운 LLM 모델이 등장할 때마다 재학습이 필요하다. **능동 학습(Active Learning)** 기반 인간-참여 접근법은 최소한의 레이블링으로 효과적인 분류기를 구축할 수 있는 대안이다.

---

## 나) 연구논문/작품의 목표

**인간 작성 코드와 LLM 생성 코드를 구분하는 능동 학습 기반 인터랙티브 분류 시스템을 설계하고 구현한다.**

구체적 목표:
1. 코드의 어휘적(lexical), 구문적(syntactic), 구조적(structural), 언어모델 기반(LM-based) 특성을 추출하는 **다차원 메트릭 파이프라인** 구축
2. 사용자가 최소한의 레이블링으로 효과적인 분류 경계를 학습할 수 있는 **3단계 능동 학습 워크플로우** 설계
3. SVM + Query by Committee(RF, MLP) 앙상블을 활용한 **불확실성 기반 샘플 선택** 전략 구현
4. 분류 과정 전체를 시각적으로 탐색·제어할 수 있는 **인터랙티브 웹 인터페이스** 개발

---

## 다) 연구논문/작품 전체 Overview

### 1. 이론적 배경

#### 1.1 능동 학습 (Active Learning)

능동 학습은 학습 알고리즘이 **가장 정보량이 많은 샘플을 능동적으로 질의**하여 레이블을 받는 반지도 학습 패러다임이다. 일반적인 지도 학습 대비 훨씬 적은 레이블로 동등한 성능에 도달할 수 있다.

본 시스템이 사용하는 핵심 능동 학습 전략:

- **Uncertainty Sampling**: SVM의 결정 함수(decision function) 값이 0에 가까운 — 즉, 결정 경계에 가까운 — 샘플을 우선 질의한다. 이 샘플들은 분류기가 가장 불확실해하는 데이터이므로, 레이블을 얻으면 결정 경계를 가장 크게 개선할 수 있다.

- **Query by Committee (QBC)**: SVM, Random Forest, MLP 세 개의 이질적 분류기가 동일 데이터에 대해 투표한다. 투표 엔트로피(vote entropy)가 높을수록, 즉 분류기들이 서로 의견이 다를수록, 해당 샘플의 불확실성이 높다고 판단한다.

  투표 엔트로피 공식:
  ```
  H(x) = -Σ (V(y)/C) × log₂(V(y)/C)
  ```
  - V(y): 클래스 y에 투표한 위원회 멤버 수
  - C: 총 위원회 멤버 수 (= 3)
  - 범위: [0, 1] — 0이면 만장일치, 1이면 최대 불일치

#### 1.2 TypiClust 알고리즘 (Cold Start)

능동 학습의 초기(cold start) 단계에서는 아직 학습된 모델이 없으므로, 불확실성 기반 샘플링이 불가능하다. 이를 해결하기 위해 **TypiClust (KMeans 클러스터링 + KNN 전형성 스코어링)** 을 사용한다.

알고리즘:
```
1. K-Means++로 특성 공간을 N개 클러스터로 분할
2. 각 클러스터 내에서 KNN 기반 전형성(typicality) 점수를 계산
   - 전형성 = 1 / (k-최근접 이웃까지의 평균 거리)
   - 밀도가 높은 영역의 중심에 가까운 샘플일수록 높은 점수
3. 각 클러스터에서 전형성이 가장 높은 샘플을 대표로 선택
4. 소규모 클러스터(< 5개)는 중심점에 가장 가까운 샘플로 폴백
```

Kennard-Stone이 특성 공간의 극단점(outlier)을 선호하는 반면, TypiClust는 각 클러스터의 가장 **전형적인(typical)** 샘플을 선택하여, 데이터 분포를 보다 충실하게 대표하는 초기 레이블 집합을 생성한다.

#### 1.3 SVM (Support Vector Machine) with RBF Kernel

- **커널**: RBF (Radial Basis Function) — 비선형 결정 경계를 학습
- **정규화**: C=1.0
- **클래스 균형화**: `compute_balanced_sample_weights` — 가중 클래스 질량(weighted class mass) 기반 균형화. sklearn의 `class_weight='balanced'`가 원시 샘플 수로만 균형을 맞추는 것과 달리, click(1.0) vs threshold(0.2) 가중치를 반영하여 실효 질량이 동일해지도록 조정
- **샘플 가중치**: 사용자 직접 레이블(`click`) = 1.0, 임계값 자동 레이블(`threshold`) = 0.2
- **스케일링**: 전체 예측 풀(full prediction pool)에 대해 StandardScaler를 학습하여 통계적 안정성 확보 (학습 데이터만으로 스케일링 시 소규모 샘플에서 불안정)
- **출력**: 결정 함수 값 (초평면으로부터의 부호화 거리) — 양수는 Human, 음수는 LLM에 가까움

#### 1.4 Query by Committee 앙상블

| 모델 | 역할 | 특성 |
|------|------|------|
| **SVM** (RBF) | 주 분류기 | 결정 경계 학습, 마진 기반 점수화 |
| **Random Forest** | 위원회 멤버 + 특성 중요도 추출 | 트리 수: max(50, min(300, n×2)), 깊이: min(5, log₂(n+1)), 가중 클래스 질량 균형화 |
| **MLP** (PyTorch) | 위원회 멤버 | 5단계 적응형 아키텍처, Dropout, Adam 옵티마이저, 조기 종료, 가중 손실 함수 |

**MLP 5단계 적응형 구성** — 학습 데이터 크기에 따라 아키텍처와 정규화를 자동 조절:

| N 샘플 | 은닉층 | Weight Decay | Dropout | 조기 종료 |
|--------|--------|-------------|---------|-----------|
| <30 | (6,) | 1×10⁻² | 0.0 | off |
| 30–100 | (12,) | 5×10⁻³ | 0.0 | on (N≥50) |
| 100–400 | (16, 8) | 5×10⁻⁴ | 0.0 | on |
| 400–1500 | (32, 16) | 1×10⁻⁴ | 0.2 | on |
| 1500+ | (64, 32) | 1×10⁻⁴ | 0.2 | on |

PyTorch MLP의 가중치 적용 방식 (cVIL 논문):
```python
loss_per_sample = CrossEntropyLoss(reduction='none')(outputs, y)
weighted_loss = (loss_per_sample * sample_weights).mean()
```

**일관된 스케일링** — SVM, RF, MLP 모두 동일한 StandardScaler(전체 예측 풀 기준)를 공유하여 이중 스케일링(double scaling) 문제를 방지한다.

#### 1.5 비지도 특성 필터링 (Unsupervised Feature Filtering)

메트릭 공간에서 노이즈를 줄이기 위한 사전 필터링:
- **저분산 필터**: 분산 < 1×10⁻⁴인 특성 식별 (정보량 부족)
- **고상관 필터**: |상관계수| ≥ 0.95인 특성 쌍에서 저분산 특성 제거 권고 (다중공선성 방지)
- 실제 제거는 하지 않고 **권장 사항**으로 제공 — 사용자가 MetricPickerPanel에서 최종 선택

---

### 2. 시스템 구성

#### 2.1 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    데이터 파이프라인 (Python)                   │
│  ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌────────┐  │
│  │ 데이터셋  │→ │ 블록 추출  │→ │ 메트릭    │→ │Parquet │  │
│  │ 로더      │   │ (AST/TS)  │   │ 추출(60+) │   │ 저장   │  │
│  └──────────┘   └───────────┘   └──────────┘   └────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│               백엔드 (FastAPI + scikit-learn + PyTorch)       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ DataService   │  │Classification│  │ ColdStartService │  │
│  │ (Polars Lazy) │  │   Service    │  │ (TypiClust)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         ↕                  ↕                  ↕              │
│  REST API: /blocks, /similarity-score-histogram, /cold-start │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│              프론트엔드 (React + TypeScript + D3.js)          │
│  ┌────────────┐ ┌──────────────┐ ┌────────────────────┐    │
│  │ Zustand    │ │ D3 히스토그램 │ │ MetricPickerPanel  │    │
│  │ 상태관리   │ │ + 임계값 핸들 │ │ + CorrelationMatrix│    │
│  └────────────┘ └──────────────┘ └────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### 2.2 데이터 파이프라인 (`pipeline/`)

**2.2.1 데이터셋 로더**

3종의 코드 저작자 데이터셋을 통합 스키마(`NormalizedSample`)로 정규화하여 로드:

| 데이터셋 | 출처 | 내용 |
|----------|------|------|
| **HumanVsAICode** | HuggingFace `OSS-forge/HumanVsAICode` | 동일 프롬프트에 대한 인간 코드 + ChatGPT/DeepSeek/Qwen 생성 코드 |
| **CodeChef Whodunit** | JSON 파일 | 경진대회 문제별 인간 풀이 + GPT-4 풀이 |
| **AIGCodeSet** | HuggingFace `basakdemirok/AIGCodeSet` | 인간 참조 코드 + 다양한 LLM 생성 코드 |

**데이터 분할**: group_id의 MD5 해시를 기반으로 결정적(deterministic) 분할 (80% train / 10% val / 10% test). 동일 group_id는 항상 같은 분할에 속하여 데이터 누수(leakage)를 방지한다.

**2.2.2 블록 추출 (`extract_blocks.py`)**

소스 파일에서 함수/메서드/클래스 단위의 코드 블록을 추출:

- **Python**: `ast` 모듈로 AST 파싱 → `FunctionDef`, `AsyncFunctionDef`, `ClassDef` 내부 메서드 추출
- **Java/JS/TS/Go/Rust**: `tree-sitter` 파서 사용 → 언어별 function/method 노드 캡처
- **최소 라인 수 필터**: 기본 3줄 미만의 블록은 제외
- **모듈 폴백**: 함수가 없는 파일은 전체를 하나의 `module` 블록으로 처리

**2.2.3 메트릭 추출 (60+ 특성)**

5개 카테고리에 걸쳐 60개 이상의 코드 메트릭을 추출:

**① 어휘적(Lexical) 메트릭 — 16개**
- 식별자 특성: 평균/표준편차 길이, 단일문자 비율, camelCase/snake_case 비율, 숫자 포함 비율, 반복 비율, 식별자 엔트로피
- 토큰 다양성: 고유 토큰 비율, type-token ratio, Yule's K (어휘 풍부도), Zipf alpha 근사값
- 구성 비율: 식별자/리터럴/키워드/공백 비율

**② 주석(Comment) 메트릭 — 6개**
- 주석 줄 비율, 인라인 주석 비율, 블록 주석 비율, 독스트링 비율 (Python), 평균 주석 길이, 비공식 태그(TODO/FIXME 등) 비율

**③ 포맷팅(Formatting) 메트릭 — 8개**
- 줄 길이 평균/표준편차, 빈 줄 비율, 빈 줄 연속 엔트로피, 들여쓰기 깊이 평균/표준편차, 탭 비율, 후행 공백 비율

**④ 복잡도(Complexity) 메트릭 — 11개**
- LOC, 비어있지 않은 LOC, 토큰 수, 함수 수, 평균 함수 길이
- 루프/분기/예외/return 수
- 순환 복잡도(Cyclomatic Complexity): `1 + loops + branches + exceptions + boolean_ops`
- 최대 중첩 깊이 (Python: 들여쓰기 기반, 기타: 중괄호 기반)
- Python의 경우 AST 기반 정밀 측정으로 오버라이드

**⑤ 언어 모델(LM) 메트릭 — 10개 (선택적)**
- **CodeBERT** (microsoft/codebert-base) 기반 마스크 언어 모델 스코어링
- 각 토큰을 마스킹하고 실제 토큰의 log-probability와 rank를 계산
- 토큰을 4개 카테고리(식별자, 특수문자, 주석, 기타)로 분류하여 카테고리별 평균 log-prob, scaled sum 산출
- **직관**: LLM이 생성한 코드는 LM의 예측 확률이 높게 나올 경향이 있음

**2.2.4 출력 형식**

3개의 Parquet 파일로 저장:
- `blocks.parquet`: block_id, file_path, block_type, block_name, language, code 등
- `metrics.parquet`: block_id + 60개 이상의 수치형 특성 컬럼
- `labels.parquet`: block_id, label(0=인간/1=AI), dataset, ai_model, split 등

#### 2.3 백엔드 (`backend/app/`)

FastAPI 기반 REST API 서버 (포트 8004):

**2.3.1 서비스 계층**

| 서비스 | 파일 | 역할 |
|--------|------|------|
| `DataService` | `data_service.py` | Polars LazyFrame으로 Parquet 로드, 특성 필터링 수행, 데이터 제공 |
| `ClassificationService` | `classification_service.py` | SVM 학습 + 위원회 학습 + 점수 산출 오케스트레이션 |
| `ColdStartService` | `cold_start_service.py` | TypiClust (KMeans + KNN typicality) 다양성 샘플링 |
| `CommitteeService` | `committee_service.py` | RF + MLP 앙상블 학습, 투표 엔트로피 계산 |
| `svm_utils` | `svm_utils.py` | SVM 학습/점수화, 가중 클래스 질량 균형화, LRU 캐시 (최대 100개 모델) |
| `feature_filter` | `feature_filter.py` | 분산/상관 기반 특성 필터링 분석 |

**2.3.2 API 엔드포인트**

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/blocks` | GET | 전체 블록 메타데이터, 메트릭 컬럼 목록, 필터 요약 반환 |
| `/api/blocks/{id}/code` | GET | 특정 블록의 소스 코드 반환 |
| `/api/similarity-score-histogram` | POST | SVM 학습 → 전체 블록 점수화 → 히스토그램 + 위원회 투표 + 특성 중요도 반환 |
| `/api/cold-start/representative` | POST | TypiClust로 N개 대표 블록 추천 |
| `/health` | GET | 헬스 체크 |

**2.3.3 SVM 모델 캐싱**

캐시 키 = MD5(정렬된 selected_ids + rejected_ids + feature_names). LRU 방식으로 최대 100개 모델을 메모리에 유지하여, 동일한 레이블 조합에 대해 재학습을 방지한다.

**2.3.4 분류 파이프라인 상세 흐름**

```
사용자 레이블 (selected/rejected + source)
    ↓
특성 해상도 결정 (사용자 선택 or 전체 필터링된 특성)
    ↓
메트릭 추출 (block_ids → 특성 행렬)
    ↓
전체 예측 풀 기준 StandardScaler 학습 (통계적 안정성)
    ↓
가중치 적용 (click=1.0, threshold=0.2) + 가중 클래스 질량 균형화
    ↓
┌─ SVM 학습 (RBF, 균형 가중치, 풀-스케일러) ──→ 결정 함수 점수
│
├─ Random Forest 학습 (SVM 스케일러 공유) ──→ 예측 + 특성 중요도
│
└─ MLP 학습 (5단계 적응형, SVM 스케일러 공유) ──→ 예측
    ↓
투표 엔트로피 계산 (3개 모델 투표)
    ↓
응답: {scores, histogram, committee_votes, feature_importances}
```

#### 2.4 프론트엔드 (`frontend/src/`)

React + TypeScript + Vite + Zustand + D3.js 기반 인터랙티브 UI:

**2.4.1 상태 관리 (Zustand Store)**

단일 Zustand 스토어에서 전체 애플리케이션 상태를 관리:
- 블록 데이터, 선택/거부 상태, 선택 소스(click/threshold/predicted)
- SVM 점수, 히스토그램 데이터, 위원회 투표 결과
- 임계값 (selectThreshold, rejectThreshold)
- 활성 스테이지, 활성화된 특성 목록, 특성 중요도 이력
- 플립 추적 (매 iteration마다 예측이 바뀐 비율 → 수렴 판단)

**2.4.2 3단계 능동 학습 워크플로우 UI**

**Stage 1 — Prototype (부트스트랩)**
```
목적: 초기 학습 데이터 확보
방법: TypiClust가 추천한 30개 대표 블록을 사용자에게 제시
조건: Human 3개 + LLM 3개 이상 레이블링 시 SVM 학습 시작
정렬: 다양성 기반 (아직 점수 없음)
```

**Stage 2 — Uncertainty (학습)**
```
목적: 결정 경계 정밀화
방법: 전체 블록을 불확실성 순으로 정렬, 결정 경계 근처 샘플 우선 제시
피드백: 매 레이블링마다 SVM + 위원회 재학습
시각화: 히스토그램, 특성 중요도, 수렴 지표 실시간 업데이트
```

**Stage 3 — Disagreement (적용)**
```
목적: 나머지 블록 자동 분류 + 이상치 검토
방법: 임계값 자동 적용 (auto-tag), 위원회 불일치 블록 검토
필터: "Disagreement only" — 투표 엔트로피 > 0인 블록만 표시
정렬: 확신도 순 (결정 경계에서 가장 먼 것부터)
```

**2.4.3 주요 컴포넌트**

| 컴포넌트 | 역할 |
|----------|------|
| `StageAccordion` | 3단계 탭 네비게이션 + 블록 리스트 (가상 스크롤) |
| `CodeBlockViewer` | PrismJS 구문 강조 + Human/Unsure/LLM 레이블 버튼 |
| `DecisionMarginHistogram` | D3 기반 결정 마진 히스토그램 — 3개 영역 (자동거부 / 미정 / 자동선택) |
| `ThresholdHandles` | 드래그 가능한 임계값 핸들 — 실시간 미리보기 |
| `SelectionPanel` + `SelectionBar` | 현재 분류 현황 시각화 (확정/자동/미정 비율) |
| `MetricPickerPanel` | 특성 선택 UI — 중요도 막대, 순위 변화, 분산 통계 |
| `CorrelationMatrix` | 상삼각 히트맵 — 특성 간 상관관계 시각화 |
| `ConvergenceIndicator` | 플립 비율 스파크라인 — 수렴 여부 시각화 |

**2.4.4 히스토그램 시각화 상세**

```
           ← LLM          Human →
    ┌──────────┬────────┬──────────┐
    │ 자동거부  │  미정   │ 자동선택  │
    │(주황 줄무늬)│(회색) │(녹색 줄무늬)│
    └──────────┴────────┴──────────┘
     ← rejectThreshold  selectThreshold →

    Y축: 블록 수 (5개 카테고리 스택 — 확정/자동 선택, 확정/자동 거부, 미정)
    X축: SVM 결정 마진 (60 bins)
    상호작용: 임계값 핸들 드래그 → SelectionBar 실시간 미리보기
```

**2.4.5 특성 선택 및 중요도 추적**

- 사용자가 MetricPickerPanel에서 특성을 활성화/비활성화
- 활성화된 특성만 `selectedFeatures`로 백엔드에 전송
- Random Forest에서 추출한 특성 중요도를 막대 그래프로 시각화
- 최근 20회 iteration의 중요도 이력을 추적하여 순위 변화(↑↓) 표시
- CorrelationMatrix에서 특성 간 상관관계를 히트맵으로 표시 (파란색 = -1, 흰색 = 0, 빨간색 = +1)

#### 2.5 평가 (`pipeline/evaluate.py`)

다양한 특성 조합(feature set)별로 분류 성능을 비교 평가:

| 특성 집합 | 설명 |
|-----------|------|
| `full` | 전체 60+ 메트릭 |
| `non_gameable` | 포맷팅/주석 메트릭 제외 (쉽게 조작 가능한 특성 배제) |
| `naming_only` | 식별자 관련 8개 특성 |
| `comments_only` | 주석 관련 6개 특성 |
| `formatting_only` | 포맷팅 관련 8개 특성 |
| `complexity_only` | 복잡도 관련 11개 특성 |
| `lm_only` | CodeBERT 기반 10개 특성 |
| `handcrafted_only` | LM 제외 전체 |
| `handcrafted_plus_lm` | 전체 (full과 동일) |

평가 메트릭: Accuracy, Precision, Recall, F1-score, ROC-AUC
평가 방식: 데이터셋별 train/test 분할, StandardScaler 정규화, SVM(RBF, balanced) 학습 후 테스트셋 평가

---

### 3. 기술 스택 요약

| 계층 | 기술 |
|------|------|
| 데이터 파이프라인 | Python, Polars, tree-sitter, AST, CodeBERT, HuggingFace datasets |
| 백엔드 | FastAPI, scikit-learn (SVM, RF), PyTorch (MLP), NumPy, Polars |
| 프론트엔드 | React 18, TypeScript, Vite, Zustand, D3.js, PrismJS, TanStack Virtual |
| 데이터 저장 | Apache Parquet |
