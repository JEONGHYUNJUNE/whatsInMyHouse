# 집에뭐있지

냉장고, 냉동실, 수납장, 팬트리 등 우리 집의 식재료와 소비기한을 관리하는 모바일 우선 PWA입니다.

## 현재 구현 범위

- 아이디·비밀번호 기반 Supabase Auth와 별칭 회원가입
- 로그인 없는 UI 미리보기 모드
- 개인 주방 및 기본 보관공간 자동 생성
- 주방맵과 공간별 식재료 보기
- 바코드 번호 기반 Open Food Facts 보조 조회
- 직접 입력, 사진 촬영/선택, 위치·수량·기한·메모 저장
- 상품명·별칭·메모·카테고리·위치 통합 검색
- 공간 간 식재료 이동과 소진 처리
- 임박 식재료 표시
- 보유 재료 기반 규칙형 레시피 매칭
- 농산물 권장 섭취일 규칙을 확장할 DB 구조

## 1. 환경변수

`.env.local` 파일에 다음 값이 필요합니다.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

## 2. Supabase SQL 실행

Supabase Dashboard의 SQL Editor에서 아래 파일 전체를 실행합니다.

```text
supabase/migrations/20260810_001_initial_kitchen_inventory.sql
```

파일 안에 테이블, 트리거, RLS, Storage, 기본 규칙과 레시피 설명을 주석으로 적어두었습니다.

## 3. 일반 회원가입 설정

Supabase Dashboard에서 다음 메뉴로 이동합니다.

```text
Authentication > Providers > Email
```

가상 이메일을 사용하는 아이디 로그인이므로 `Confirm email`을 꺼야 가입 직후 로그인됩니다.

001 SQL을 이미 실행한 프로젝트는 다음 SQL도 추가로 실행합니다.

```text
supabase/migrations/20260810_002_username_auth.sql
```

가상 이메일로 실제 메일 발송을 시도하지 않도록 다음 SQL도 실행합니다.

```text
supabase/migrations/20260810_003_username_email_hook.sql
```

SQL 실행 후 Supabase Dashboard에서 다음 Hook을 활성화합니다.

```text
Authentication > Hooks > Send Email > Add hook
Hook type: Postgres Function
Schema: public
Function: ignore_username_auth_email
```

`Authentication > Providers > Email`에서는 Email Provider를 켜고 `Confirm email`을 꺼둡니다. Send Email Hook은 Supabase 기본 메일 전송을 대체하며, 이 앱에서는 내부 가상 이메일을 외부로 발송하지 않고 성공 응답만 반환합니다. 비밀번호 재설정 메일도 발송되지 않으므로 초기 버전에서는 관리자가 계정을 복구해야 합니다.

## 4. Google 로그인 설정 (상용화 단계)

1. Google Cloud에서 Web OAuth Client를 생성합니다.
2. Authorized redirect URI에 Supabase Dashboard가 안내하는 callback URL을 넣습니다.
3. Supabase > Authentication > Providers > Google에 Client ID와 Secret을 넣고 활성화합니다.
4. Supabase > Authentication > URL Configuration에 로컬과 배포 주소를 등록합니다.

개발 기본 주소 예시:

```text
http://localhost:5173
```

## 5. 실행

```bash
npm install
npm run dev
```

프로덕션 빌드:

```bash
npm run build
```

## 데이터 안전

- `service_role` 키와 DB 비밀번호는 프론트 환경변수에 넣지 않습니다.
- 사용자 데이터는 Supabase RLS로 같은 주방 구성원에게만 허용합니다.
- 상품 이미지는 `inventory-images` 버킷에 저장합니다.

## 다음 구현 후보

- 모바일 카메라 연속 바코드 스캔
- 식품안전나라 API를 호출하는 Supabase Edge Function
- 권장 섭취일 자동 적용 UI
- 주방맵 드래그·크기 조절·저장
- 소비기한 웹 푸시 Edge Function과 cron
- 요리 다이어리, 친구 코드, 공유 다이어리
