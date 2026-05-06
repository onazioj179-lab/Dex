{
  "targets": [
    {
      "target_name": "dex_cpp",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": [
        "src/addon.cpp",
        "src/bloom.cpp",
        "src/spatial.cpp",
        "src/hash.cpp",
        "src/signal.cpp",
        "src/matrix.cpp",
        "src/threadpool.cpp",
        "src/mempool.cpp",
        "src/cache.cpp",
        "src/scheduler.cpp",
        "src/ioengine.cpp",
        "src/profiler.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/std:c++20", "/O2", "/fp:fast"],
              "ExceptionHandling": 1
            }
          }
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
            "GCC_OPTIMIZATION_LEVEL": "3",
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "12.0"
          }
        }],
        ["OS=='linux'", {
          "cflags_cc": ["-std=c++20", "-O3", "-ffast-math", "-march=native"]
        }]
      ]
    }
  ]
}
