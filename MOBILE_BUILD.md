# 모바일 빌드 가이드

이 프로젝트는 Vite가 만든 `dist`를 Capacitor 8.4.2 네이티브 WebView에 담는 구조입니다. 모든 게임 장면은 Canvas 2D 렌더러를 사용하며, 크랙·팬 좌우 굴리기·위로 플릭 같은 포인터 제스처를 마우스와 터치에서 함께 처리합니다.

`capacitor.config.json`과 패키지 스크립트는 준비되어 있지만 `android/` 네이티브 프로젝트는 아직 생성하지 않았습니다.

## 1. 앱 ID 결정

현재 `appId`인 `com.eggcellent.kitchen`은 임시 값입니다. `npm run cap:add:android`를 실행하기 전에 본인이 관리하는 역도메인 형식의 고유 ID(예: `com.mycompany.eggcellent`)로 바꾸세요. 스토어에 등록한 뒤 앱 ID를 변경하면 기존 앱의 서명과 업데이트 연결이 어려워집니다.

## 2. Windows와 VS Code에서 Android 준비

Capacitor 8은 Node.js 22 이상, Android Studio 2025.2.1 이상과 Android SDK가 필요합니다. Android Studio의 SDK Manager에서 Android 16/API 36 SDK Platform과 SDK Tools를 설치하세요. JDK는 Android Studio가 함께 관리합니다.

공식 문서: [Capacitor 환경 설정](https://capacitorjs.com/docs/getting-started/environment-setup), [Capacitor Android 시작](https://capacitorjs.com/docs/android), [Android Studio 설치](https://developer.android.com/studio/install)

프로젝트 루트의 VS Code 터미널에서 최초 한 번 실행합니다.

```bash
npm install
npm run cap:add:android
npm run cap:sync:android
```

그다음 Android Studio를 열거나 연결된 기기·에뮬레이터에서 실행합니다.

```bash
npm run cap:open:android
npm run cap:run:android
```

웹 코드를 수정한 뒤에는 다음 명령으로 프로덕션 빌드와 네이티브 프로젝트 동기화를 함께 수행합니다.

```bash
npm run cap:sync:android
```

`npm run cap:add:android`는 `android/` 폴더가 이미 있으면 다시 실행하지 마세요. Capacitor의 권장 반복 작업은 [공식 워크플로](https://capacitorjs.com/docs/basics/workflow)에 정리되어 있습니다.

## 3. iOS 제약

Windows와 VS Code에서는 공용 웹 코드를 개발하고 브라우저에서 모바일 화면을 검증할 수 있지만 iOS Simulator, IPA 생성, 코드 서명과 App Store 제출은 할 수 없습니다. iOS 빌드에는 macOS, Xcode 26 이상과 Apple 서명 환경이 필요합니다. Mac을 준비한 뒤 동일한 8.4.2 버전의 `@capacitor/ios`를 설치하고 `npx cap add ios`를 실행하세요.

공식 문서: [Capacitor iOS 요구사항](https://capacitorjs.com/docs/getting-started/environment-setup#ios-requirements), [Capacitor iOS 시작](https://capacitorjs.com/docs/ios), [Xcode 시스템 요구사항](https://developer.apple.com/xcode/system-requirements)

Mac이 없을 때는 먼저 HTTPS로 배포한 PWA를 iPhone 홈 화면에서 검증할 수 있지만, 이는 IPA/App Store 빌드를 대신하지는 않습니다. [Capacitor PWA 가이드](https://capacitorjs.com/docs/web/progressive-web-apps)

## 4. 아이콘과 스플래시

네이티브 프로젝트 생성 후 공식 `@capacitor/assets` 도구를 사용할 수 있습니다.

```bash
npm install --save-dev @capacitor/assets
npx capacitor-assets generate
```

- 아이콘 원본은 최소 1024×1024 PNG/JPG로 준비합니다.
- 스플래시 원본은 최소 2732×2732로 준비합니다.
- Android adaptive icon용 전경과 배경을 분리하고 팬과 노른자 실루엣 같은 핵심 요소는 중앙 안전 영역에 둡니다.
- 라이트·다크 스플래시와 실제 런처 마스크 결과를 모두 확인합니다.

파일 이름과 생성 규칙: [Capacitor 아이콘·스플래시 가이드](https://capacitorjs.com/docs/guides/splash-screens-and-icons)

## 5. 게임 플레이 실기기 점검

브라우저의 마우스 테스트만으로는 실제 손가락 제스처를 충분히 검증할 수 없습니다. Android System WebView를 최신 상태로 업데이트하고 에뮬레이터뿐 아니라 중저가 Android 실기기에서도 다음 전체 흐름을 확인하세요.

1. 계란을 아래로 휘둘러 팬 림에 깨기
2. 팬을 좌우로 여러 번 굴려 기름 코팅하기
3. 타이밍에 맞춰 소금 버튼 누르기
4. 팬을 아래에서 위로 플릭해 계란 뒤집기
5. 익힘 구간에서 접시에 담기

특히 아래 항목을 확인합니다.

- 세로·가로·태블릿에서 팬 조작 영역이 손가락에 가려지거나 화면 밖으로 벗어나지 않는지
- 노치, 상태 표시줄과 제스처 바가 HUD와 완성 버튼을 가리지 않는지
- 짧은 좌우 왕복과 위쪽 플릭이 스크롤·뒤로 가기 제스처로 오인되지 않는지
- 너무 빠른 팬 굴리기나 실패한 플립 후에도 라운드가 계속되는지
- 화면 밖 이동, `pointercancel`, 알림과 앱 백그라운드 전환 뒤 입력이 붙잡힌 상태로 남지 않는지
- 라이트·다크 모드에서 계란의 흰자, 노른자, 기름과 플립 안내가 명확히 구별되는지
- 소리 재개, 터치 지연, 발열과 배터리 소모가 안정적인지
- 계란·프라이팬·주방 배경 스킨이 개별적으로 저장되고 재실행 뒤 복원되는지

Android 16/API 36은 edge-to-edge 표시를 강제하므로 CSS safe-area뿐 아니라 실제 기기에서 시스템 바 겹침을 확인해야 합니다. Canvas 2D 해상도는 화면 픽셀 예산 안에서 제한하고, 백그라운드 진입 시 애니메이션과 조리 시간을 안전하게 멈춰야 합니다.

관련 문서: [Android WebView](https://developer.chrome.com/docs/webview), [Android 16 동작 변경](https://developer.android.com/about/versions/16/behavior-changes-16)

## 6. 웹 회귀 테스트

네이티브 동기화 전에 웹 빌드와 smoke test를 실행합니다.

```bash
npm run build
npm run test:smoke
```

테스트는 크랙, 팬 굴리기, 소금, 플립, 플레이팅, 실패 후 계속 진행, 결과 별점과 주요 모바일 화면 크기를 확인합니다. 브라우저 자동화가 통과하더라도 네이티브 WebView의 시스템 제스처와 앱 생명주기는 실기기에서 별도로 확인해야 합니다.

## 7. 릴리스

Google Play 배포는 Android Studio의 **Build → Generate Signed Bundle/APK**에서 Android App Bundle(AAB)을 생성하는 방법을 권장합니다.

- 업로드 키와 `.jks` 키스토어를 저장소에 커밋하지 말고 안전하게 이중 백업합니다.
- 디버그 APK가 아닌 release AAB를 실제 기기와 내부 테스트 트랙에서 확인합니다.
- Capacitor 8의 Android target SDK는 API 36이며, 2026년 8월 31일부터 Google Play의 새 앱과 업데이트도 API 36 이상을 요구합니다.
- 개발용 `server.url`, cleartext HTTP 또는 `allowMixedContent` 설정을 릴리스에 남기지 않습니다.

공식 문서: [Android 앱 서명](https://developer.android.com/studio/publish/app-signing), [Google Play target API 요구사항](https://developer.android.com/google/play/requirements/target-sdk), [Capacitor target SDK 표](https://capacitorjs.com/docs/android/setting-target-sdk)
