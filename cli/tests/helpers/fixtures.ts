export const SAMPLE_UI_TREE_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.android.systemui" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2280]">
    <node index="0" text="Welcome" resource-id="com.example.app:id/title" class="android.widget.TextView" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,200][980,300]" />
    <node index="1" text="Login" resource-id="com.example.app:id/login_btn" class="android.widget.Button" package="com.example.app" content-desc="Login button" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,400][980,500]" />
  </node>
</hierarchy>
`;

export const SAMPLE_LOGCAT_LINES = `05-13 12:34:56.789  1234  5678 I MyApp   : Login button tapped
05-13 12:34:56.890  1234  5678 D MyApp   : Calling auth.signIn
05-13 12:34:57.123  1234  5678 W MyApp   : Slow response (200ms)
05-13 12:34:57.456  1234  5678 E MyApp   : Auth failed: invalid_credentials
`;
