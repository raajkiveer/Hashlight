cmake_minimum_required(VERSION 3.16)
project(hash_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(hash_engine hash_engine.cpp)
target_include_directories(hash_engine PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# Emscripten identifies its C++ compiler as Clang, so checking only
# CMAKE_CXX_COMPILER_ID silently skips these linker exports.
if (EMSCRIPTEN OR CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
  set_target_properties(hash_engine PROPERTIES SUFFIX ".js")
  target_link_options(hash_engine PRIVATE
    "-sEXPORTED_FUNCTIONS=['_calculate_hash','_count_candidates','_start_search','_search_step','_pause_search','_resume_search','_stop_search','_get_search_result']"
    "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "-sMODULARIZE=1"
    "-sEXPORT_ES6=1"
    "-Wl,--no-entry"
    "-sENVIRONMENT=web,worker"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sFILESYSTEM=0")
endif()
