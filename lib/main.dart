import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

// The web-only embedding uses dart:ui.platformViewRegistry
// and dart:html to create an IFrame that points to the three_app/index.html.
// This file is intentionally simple; it shows the three.js app inside an iframe on the web.

// Web-only imports
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
// ignore: undefined_prefixed_name
import 'dart:ui' as ui;

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) {
      return const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Text('This Flutter shell is web-only. Run in a browser.'),
          ),
        ),
      );
    }

    // Register a view factory that creates an iframe pointing to the three_app.
    // When you build the Flutter web app, ensure three_app/ files are copied into the final web/ folder
    // (or served from the same origin) so the iframe can load them.
    ui.platformViewRegistry.registerViewFactory('three-view', (int viewId) {
      final iframe = html.IFrameElement()
        ..src = 'three_app/index.html'
        ..style.border = '0'
        ..style.width = '100%'
        ..style.height = '100%'
        ..allow = 'gyroscope; accelerometer; fullscreen';
      return iframe;
    });

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        appBar: AppBar(
          title: const Text('Pinball Sandbox (Flutter shell)'),
        ),
        body: const SizedBox.expand(
          child: HtmlElementView(viewType: 'three-view'),
        ),
      ),
    );
  }
}
