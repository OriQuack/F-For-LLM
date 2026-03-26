# 파이프라인 설명

### 1. 파이프라인
0. 데이터셋은 hugging face의 human vs ai code를 사용함
1. 문제에 대해 인간(학생) 코드와 llm 코드를 block (함수 등) 별로 분해 
<pipeline/loaders/> <pipeline/build_dataset.py> <pipeline/extract_block.py> <pipeline/schema>

2. 바로 이어서 Block 별로 Metric을 뽑아냄, metric 종류는 다음 경로에 있는 곳에 별로 정리함.
<pipeline/metrics/>

3. 프론트엔드에서 사용자가 유의미한 것을 추림 (label 생성), 모델 학습, (이후 과정 생략) ...

### 2. 데이터셋 빌드

```bash
/F-For-LLM 위치에서
python -m pipeline.build_dataset \
  --languages python \
  --skip-codechef \
  --skip-aigcodeset \
  --humanvsai-limit-rows 2000
```
arg는 <pipeline/build_dataset.py> 참고

### 3. API
block 단위 조회 / 코드 조회 / 유사도 점수 계산 / cold-start 추천 API를 사용할 수 있음

GET /api/blocks : 전체 block 목록과 현재 사용 가능한 metric 정보를 반환
GET /api/blocks/{block_id}/code : 특정 block의 실제 코드 원문을 반환

기존 api에서 크게 달라진 것은 없는데, schema 값에 접근하려 한다면 새로운 endpoint를 추가해야 함.