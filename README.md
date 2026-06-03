# 부동산 밸런스 카드 서버 버전

이 버전은 게임을 서버에서 제공하고, 무한 모드 기록을 공개 순위표로 저장합니다. 운영 배포에서는 `DATABASE_URL` 환경변수로 Neon Postgres에 저장하고, 로컬 테스트에서는 `data/leaderboard.json`을 fallback 저장소로 사용합니다.

## 무한 모드 점수 규칙

- 매 턴 생존 점수: 쉬움 8점, 보통 10점, 어려움 12점
- 최저 지표가 45 이상이면 균형 보너스 3점
- 평균 지표가 62 이상이면 운영 탄력 보너스 5점
- 무한 모드에서 4대 지표 중 하나가 100점에 도달하면 해당 지표에 별이 1개 붙습니다.
- 100점 이후 추가 지표 성장치가 20점 쌓일 때마다 같은 지표에 별이 1개 더 붙습니다.
- 별이 생길 때마다 현재 점수의 20%가 보너스 점수로 추가됩니다.
- 순위표는 `쉬움 / 보통 / 어려움` 탭으로 분리됩니다.

## 로컬 실행

처음 한 번은 의존성을 설치합니다.

```bash
npm install
```

그다음 서버를 실행합니다.

```bash
npm start
```

실행 후 브라우저에서 `http://localhost:8787`로 접속합니다.
`http://localhost:8787/health`에서 `"database": "local-json"`이 나오면 로컬 테스트 모드입니다.

Windows에서 바로 켜려면 이 폴더의 스크립트를 실행해도 됩니다.

```powershell
powershell -ExecutionPolicy Bypass -File start-server.ps1
```

서버를 끄려면:

```powershell
powershell -ExecutionPolicy Bypass -File stop-server.ps1
```

## 배포 구조

- `public/index.html`: 게임 화면
- `server.js`: 정적 파일 제공 + Neon/Postgres 순위표 API
- `data/leaderboard.json`: 로컬 테스트용 순위표 저장소
- `start-server.ps1`: Windows 로컬 서버 시작
- `stop-server.ps1`: Windows 로컬 서버 종료

## 24시간 공개 운영

Render, Railway, Fly.io 같은 Node 서버 호스팅에 이 폴더를 업로드하면 됩니다. 초보자 기준으로는 Render가 가장 단순합니다.

### 추천: Render

1. GitHub에 `real-estate-balance-cards-server` 폴더 내용을 저장소로 올립니다.
2. Render에서 New > Web Service를 선택합니다.
3. GitHub 저장소를 연결합니다.
4. 설정값을 아래처럼 둡니다.
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
5. Environment Variables에 `DATABASE_URL`을 추가하고 Neon connection string을 넣습니다.
6. 배포가 끝나면 `https://서비스명.onrender.com` 형태의 공개 링크가 생성됩니다.
7. `https://서비스명.onrender.com/health`에서 `"database": "postgres"`가 나오면 Neon 연결 성공입니다.

### Neon Postgres

1. Neon에서 새 프로젝트를 만듭니다.
2. Connect 또는 Connection string 메뉴에서 PostgreSQL connection string을 복사합니다.
3. Render Web Service의 Environment Variables에 아래처럼 넣습니다.

```txt
Key: DATABASE_URL
Value: postgresql://...?...sslmode=require
```

이 값은 절대 GitHub에 올리지 마세요.

### 대안: Railway

1. Railway에서 새 프로젝트를 만들고 GitHub 저장소를 연결합니다.
2. Node 프로젝트로 감지되면 Start Command를 `npm start`로 둡니다.
3. 배포 후 생성되는 공개 도메인을 사용합니다.

### 대안: Fly.io

1. Fly CLI를 설치하고 이 폴더에서 `fly launch`를 실행합니다.
2. 설정 파일이 만들어지면 `fly deploy`로 배포합니다.
3. 장기 기록 보존이 필요하면 볼륨 또는 외부 DB를 연결합니다.

- Start command: `npm start`
- Port: 호스팅 서비스가 제공하는 `PORT` 환경변수를 자동 사용합니다.
- 기록 유지: Render 무료 Web Service의 로컬 파일 저장은 운영용으로 안전하지 않습니다. 공개 순위표는 Neon `DATABASE_URL`을 연결해서 Postgres에 저장하세요.

정적 호스팅인 Netlify Drop/GitHub Pages만 쓰면 게임은 열리지만 서버 기록 공유는 되지 않습니다. 공개 순위표까지 필요하면 이 서버 버전을 배포해야 합니다.
