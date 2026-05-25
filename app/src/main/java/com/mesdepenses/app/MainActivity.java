package com.mesdepenses.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Application "Mes Dépenses".
 *
 * L'interface (HTML/CSS/JS) est embarquée dans le dossier "assets" et
 * affichée dans une WebView. Les données saisies sont stockées par la
 * WebView dans l'espace privé de l'application
 * (/data/data/com.mesdepenses.app/), totalement indépendant de Chrome
 * ou de tout autre navigateur.
 */
public class MainActivity extends Activity {

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor("#0F766E"));

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        // Active localStorage : c'est ici que les données sont conservées.
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);

        // Pont permettant au JavaScript d'enregistrer un fichier de sauvegarde.
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidApp");

        // Gère le bouton "Importer un fichier" (champ <input type="file">).
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(
                            Intent.createChooser(intent, "Choisir un fichier de sauvegarde"),
                            FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback == null) {
                return;
            }
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{ data.getData() };
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /** Pont entre le JavaScript de l'application et Android. */
    private class AndroidBridge {

        /**
         * Enregistre une sauvegarde JSON dans le dossier public
         * "Téléchargements" du téléphone. Aucune permission requise
         * (API 29+, via MediaStore).
         */
        @JavascriptInterface
        public String saveBackup(String filename, String content) {
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                values.put(MediaStore.Downloads.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS);

                Uri uri = getContentResolver().insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    return null;
                }

                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os == null) {
                    return null;
                }
                os.write(content.getBytes(StandardCharsets.UTF_8));
                os.close();

                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "Sauvegarde enregistrée dans le dossier Téléchargements",
                        Toast.LENGTH_LONG).show());

                return "Sauvegarde enregistrée dans Téléchargements : " + filename;
            } catch (Exception e) {
                return null;
            }
        }

        /**
         * Enregistre un fichier PDF reçu en base64 depuis le JavaScript,
         * dans le dossier "Téléchargements".
         */
        @JavascriptInterface
        public String savePdf(String filename, String base64Content) {
            try {
                byte[] bytes = Base64.decode(base64Content, Base64.DEFAULT);

                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                values.put(MediaStore.Downloads.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS);

                Uri uri = getContentResolver().insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    return null;
                }

                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os == null) {
                    return null;
                }
                os.write(bytes);
                os.close();

                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "PDF enregistré dans le dossier Téléchargements",
                        Toast.LENGTH_LONG).show());

                return "PDF enregistré : " + filename;
            } catch (Exception e) {
                return null;
            }
        }
    }
}
