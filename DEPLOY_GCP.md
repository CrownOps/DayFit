# DayFit 배포 가이드 (Google Cloud Free Tier + dentalsyncs.com)

Google Cloud **Always Free** e2-micro VM에 Postgres + API + 웹을 셀프호스팅.
Caddy가 리버스 프록시 + Let's Encrypt 자동 HTTPS를 담당. 도메인 하나(`dentalsyncs.com`)로
프론트/백엔드를 같이 서빙한다 — 백엔드 라우터가 전부 `/api/*` 프리픽스라 경로로 나뉜다.

| 경로 | 대상 |
|---|---|
| `dentalsyncs.com/api/*` | `api` 컨테이너 (FastAPI) |
| `dentalsyncs.com/*` (나머지) | `web` 컨테이너 (Next.js) |

## 0. GCP 프로젝트 + VM 생성 (콘솔에서 직접)

1. https://console.cloud.google.com → 프로젝트 생성 (또는 기존 프로젝트 선택).
2. **Compute Engine → VM instances → Create Instance** (처음이면 Compute Engine API 활성화 프롬프트 뜸 → 활성화).
   - Name: `dayfit`
   - Region: **`us-central1`** (Always Free 대상 리전 — `us-west1`, `us-east1`도 가능. 이 셋 중 하나 필수)
   - Machine type: **`e2-micro`** (Always Free 대상 스펙)
   - Boot disk → Change: **Ubuntu 24.04 LTS**, Standard persistent disk, **30GB** (Always Free 한도)
   - Firewall: **Allow HTTP traffic**, **Allow HTTPS traffic** 체크
   - "Security" 섹션 → SSH Keys → **Add item** → 아래 공개키를 `dayfit:` 접두사와 함께 붙여넣기:
     ```
     dayfit:ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHQ0t56FMwIVT/24OEMx8QBShrmV9QvTU2QtekVHx1YV dayfit-deploy
     ```
3. 생성 후 인스턴스 목록에서 **External IP** 확인해서 알려주세요.

e2-micro는 메모리가 1GB뿐이라 Next.js 빌드 중 OOM이 날 수 있음 → 아래 1단계에서 스왑 파일을 먼저 만든다.

## 1. SSH 접속 + Docker 설치 + 스왑

```bash
ssh -i ~/.ssh/dayfit_gcp dayfit@<EXTERNAL_IP>

# 스왑 2GB (e2-micro 1GB RAM 보완, 빌드 중 OOM 방지)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker + Compose plugin 설치
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

## 2. Cloudflare DNS 설정

dash.cloudflare.com → dentalsyncs.com → DNS → **Add record**
- Type: `A`, Name: `@`, Content: `<EXTERNAL_IP>`, Proxy status: **DNS only (회색 구름)**

⚠️ 처음엔 반드시 회색 구름(프록시 끔)으로 — Caddy가 Let's Encrypt 인증서를 직접 발급받으려면
도메인이 VM IP로 바로 풀려야 함. 인증서 발급 성공 후에는 주황 구름(프록시 켬)으로 바꿔도 되지만,
그 경우 Cloudflare SSL/TLS 모드를 **Full (strict)**로 맞춰야 함.

기존에 있던 `dentalsyncs.com → crownops.net` 리다이렉트 규칙(Rules → Redirect Rules 또는
Page Rules)도 이 시점에 삭제해야 새 A 레코드가 실제로 적용됨.

## 3. 코드 배포

로컬에서 (이 리포 루트):
```bash
git archive --format=tar HEAD | ssh -i ~/.ssh/dayfit_gcp dayfit@<EXTERNAL_IP> "mkdir -p ~/dayfit && tar -x -C ~/dayfit"
```

VM에서:
```bash
cd ~/dayfit
cp deploy/env.prod.example .env
nano .env   # DOMAIN, POSTGRES_PASSWORD, SECRET_KEY, ENCRYPTION_KEY, VAPID_* 채우기
```

시크릿 생성:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"          # SECRET_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # ENCRYPTION_KEY (cryptography 미설치 시 pip install cryptography)
```
VAPID는 로컬 `backend/.env`에 있는 기존 값을 그대로 재사용 (기존 구독 유지하려면 필수).

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy   # 인증서 발급 로그 확인
```

빌드가 메모리 부족으로 죽으면(`Killed` 로그) 스왑이 제대로 활성화됐는지 `free -h`로 확인.

## 4. 관리자 시딩

```bash
docker compose -f docker-compose.prod.yml exec api python scripts/seed_admin.py <email> <password> [gcs_token]
```

## 5. 확인

- `https://dentalsyncs.com/api/health` → `{"status":"ok"}`
- `https://dentalsyncs.com` → 로그인 화면

## 재배포 (코드 변경 시)

```bash
# 로컬:
git archive --format=tar HEAD | ssh -i ~/.ssh/dayfit_gcp dayfit@<EXTERNAL_IP> "mkdir -p ~/dayfit && tar -x -C ~/dayfit"
# VM:
cd ~/dayfit && docker compose -f docker-compose.prod.yml up -d --build
```
`api` 시작 시 `alembic upgrade head`가 자동 실행됨 (backend/Dockerfile CMD).

## 주의

- **컨테이너 복제(scale) 금지**: `api`는 반드시 1개만 — 2개 이상이면 APScheduler가 알림을 중복 발송.
- Postgres 데이터는 `dayfit_db_data` 도커 볼륨에 저장 — VM을 지우면 같이 날아감. 정기 백업 필요하면 `docker compose exec db pg_dump ...` cron 추천 (원하면 다음에 설정).
- `.env`는 VM에만 존재, 커밋 금지.
- Google Cloud Always Free는 **계정당 e2-micro 1대**까지만 무료 — VM을 더 만들면 과금됨.
- Google Calendar 연동 쓰는 사용자는 각자 Google Cloud OAuth 클라이언트의 승인된 리디렉션 URI에
  `https://dentalsyncs.com/api/calendar/oauth/callback` 등록 필요.
