#include "hash_engine.hpp"

#include <array>
#include <cstdint>
#include <cstring>
#include <array>
#include <limits>
#include <string>
#include <vector>
#include <sstream>
#include <chrono>
#include <algorithm>
#include <cstdlib>
#include <cctype>
#include <limits>
#include <unordered_map>

namespace {
constexpr std::array<uint32_t, 64> SHIFT = {
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21};

constexpr std::array<uint32_t, 64> CONSTANTS = {
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391};

uint32_t rotate_left(uint32_t value, uint32_t amount) {
  return (value << amount) | (value >> (32 - amount));
}

std::string md5(const char* input) {
  const auto* bytes = reinterpret_cast<const uint8_t*>(input);
  const size_t input_length = std::strlen(input);
  const uint64_t bit_length = static_cast<uint64_t>(input_length) * 8;
  const size_t padded_length = ((input_length + 9 + 63) / 64) * 64;
  std::string data(padded_length, '\0');
  std::memcpy(&data[0], bytes, input_length);
  data[input_length] = static_cast<char>(0x80);
  for (size_t i = 0; i < 8; ++i) {
    data[padded_length - 8 + i] = static_cast<char>((bit_length >> (i * 8)) & 0xff);
  }

  uint32_t a0 = 0x67452301;
  uint32_t b0 = 0xefcdab89;
  uint32_t c0 = 0x98badcfe;
  uint32_t d0 = 0x10325476;

  for (size_t offset = 0; offset < padded_length; offset += 64) {
    std::array<uint32_t, 16> words{};
    for (size_t i = 0; i < 16; ++i) {
      for (size_t byte = 0; byte < 4; ++byte) {
        words[i] |= static_cast<uint32_t>(
                        static_cast<unsigned char>(data[offset + i * 4 + byte]))
                    << (byte * 8);
      }
    }

    uint32_t a = a0;
    uint32_t b = b0;
    uint32_t c = c0;
    uint32_t d = d0;
    for (uint32_t i = 0; i < 64; ++i) {
      uint32_t function;
      uint32_t word_index;
      if (i < 16) {
        function = (b & c) | ((~b) & d);
        word_index = i;
      } else if (i < 32) {
        function = (d & b) | ((~d) & c);
        word_index = (5 * i + 1) % 16;
      } else if (i < 48) {
        function = b ^ c ^ d;
        word_index = (3 * i + 5) % 16;
      } else {
        function = c ^ (b | (~d));
        word_index = (7 * i) % 16;
      }
      const uint32_t next = a + function + CONSTANTS[i] + words[word_index];
      a = d;
      d = c;
      c = b;
      b += rotate_left(next, SHIFT[i]);
    }
    a0 += a;
    b0 += b;
    c0 += c;
    d0 += d;
  }

  const std::array<uint32_t, 4> digest = {a0, b0, c0, d0};
  std::string output;
  output.reserve(32);
  constexpr char hex[] = "0123456789abcdef";
  for (const uint32_t word : digest) {
    for (size_t byte = 0; byte < 4; ++byte) {
      const uint8_t value = static_cast<uint8_t>((word >> (byte * 8)) & 0xff);
      output.push_back(hex[value >> 4]);
      output.push_back(hex[value & 0x0f]);
    }
  }
  return output;
}
}  // namespace

namespace {
struct SearchState {
  std::string target, result, candidate;
  std::vector<std::vector<std::vector<std::string>>> patterns;
  int mins[5]{}, maxs[5]{};
  bool allow_repeat = false, allow_consecutive = false, paused = false, stopped = false, active = false;
  int max_occurrence = 1, max_matches = 1, matches = 0;
  uint64_t attempts = 0;
  int64_t possibility_limit = -1;
  double time_limit = 30.0;
  std::chrono::steady_clock::time_point started;
  std::string status = "idle", reason;
  bool hit_deadline = false;
  std::vector<size_t> cursor;
  bool cursor_initialized = false, exhausted = false;
  size_t pattern_index = 0;
} state;

std::vector<std::string> split(const std::string& value, char delimiter) {
  std::vector<std::string> result;
  std::stringstream stream(value);
  std::string part;
  while (std::getline(stream, part, delimiter)) result.push_back(part);
  if (!value.empty() && value.back() == delimiter) result.push_back("");
  return result;
}
bool parseInt(const std::string& value, int& out) {
  try { out = std::stoi(value); return true; } catch (...) { return false; }
}
int categoryOf(char ch) {
  return std::isupper(static_cast<unsigned char>(ch)) ? 0 :
    std::islower(static_cast<unsigned char>(ch)) ? 1 :
    std::isdigit(static_cast<unsigned char>(ch)) ? 2 : ch == ' ' ? 4 : 3;
}

struct CountConfig {
  bool allow_repeat = false, allow_consecutive = false;
  int max_occurrence = 1;
  int mins[5]{}, maxs[5]{};
  std::vector<std::vector<std::string>> patterns;
};

bool addChecked(uint64_t& total, uint64_t value) {
  if (std::numeric_limits<uint64_t>::max() - total < value) return false;
  total += value;
  return true;
}

bool unconstrainedCounts(const CountConfig& config, size_t length) {
  for (int i = 0; i < 5; ++i)
    if (config.mins[i] != 0 || config.maxs[i] < static_cast<int>(length)) return false;
  return true;
}

std::string countKey(size_t position, const int counts[5],
                     const std::vector<int>& occurrences, char last) {
  std::string key = std::to_string(position) + "|" + std::to_string(static_cast<unsigned char>(last));
  for (int i = 0; i < 5; ++i) key += "," + std::to_string(counts[i]);
  key += "|";
  for (size_t i = 0; i < occurrences.size(); ++i)
    if (occurrences[i]) key += std::to_string(i) + ":" + std::to_string(occurrences[i]) + ",";
  return key;
}

uint64_t countPattern(const CountConfig& config, const std::vector<std::string>& domains,
                      size_t position, int counts[5], std::vector<int>& occurrences,
                      char last, std::unordered_map<std::string, uint64_t>& memo,
                      bool& overflow) {
  if (position == domains.size()) {
    for (int i = 0; i < 5; ++i)
      if (counts[i] < config.mins[i] || counts[i] > config.maxs[i]) return 0;
    return 1;
  }
  const std::string key = countKey(position, counts, occurrences, last);
  const auto cached = memo.find(key);
  if (cached != memo.end()) return cached->second;
  uint64_t total = 0;
  for (char ch : domains[position]) {
    const int category = categoryOf(ch);
    const unsigned char index = static_cast<unsigned char>(ch);
    if (counts[category] >= config.maxs[category] ||
        (!config.allow_consecutive && ch == last) ||
        (!config.allow_repeat && occurrences[index] > 0) ||
        (config.allow_repeat && occurrences[index] >= config.max_occurrence)) continue;
    ++counts[category]; ++occurrences[index];
    const uint64_t branch = countPattern(config, domains, position + 1, counts, occurrences, ch, memo, overflow);
    --occurrences[index]; --counts[category];
    if (!addChecked(total, branch)) { overflow = true; return 0; }
  }
  memo.emplace(key, total);
  return total;
}

int countSimpleProduct(const CountConfig& config, const std::vector<std::string>& domains,
                       uint64_t& total) {
  if (!config.allow_repeat || !config.allow_consecutive ||
      config.max_occurrence < static_cast<int>(domains.size()) ||
      !unconstrainedCounts(config, domains.size())) return 0;
  total = 1;
  for (const auto& domain : domains) {
    if (domain.empty()) { total = 0; return 1; }
    if (total > std::numeric_limits<uint64_t>::max() / domain.size()) return 2;
    total *= domain.size();
  }
  return 1;
}

std::string calculateCandidateCount(const char* encoded) {
  const auto fields = split(encoded ? encoded : "", '|');
  if (fields.size() < 5) return "ERROR: invalid candidate configuration";
  CountConfig config;
  config.allow_repeat = std::atoi(fields[0].c_str()) != 0;
  config.max_occurrence = std::atoi(fields[1].c_str());
  config.allow_consecutive = std::atoi(fields[2].c_str()) != 0;
  const auto count_fields = split(fields[3], ',');
  for (size_t i = 0; i < 5 && i * 2 + 1 < count_fields.size(); ++i) {
    config.mins[i] = std::atoi(count_fields[i * 2].c_str());
    config.maxs[i] = std::atoi(count_fields[i * 2 + 1].c_str());
  }
  for (const auto& pattern : split(fields[4], '\x1f'))
    config.patterns.push_back(split(pattern, '\x1e'));

  uint64_t total = 0;
  for (const auto& domains : config.patterns) {
    uint64_t pattern_total = 0;
    const int simple = countSimpleProduct(config, domains, pattern_total);
    if (simple == 2) return "OVERFLOW";
    if (simple == 0) {
      int counts[5]{}; std::vector<int> occurrences(256); bool overflow = false;
      std::unordered_map<std::string, uint64_t> memo;
      pattern_total = countPattern(config, domains, 0, counts, occurrences, 0, memo, overflow);
      if (overflow) return "OVERFLOW";
    }
    if (!addChecked(total, pattern_total)) return "OVERFLOW";
  }
  return std::to_string(total);
}
void finish(const char* reason) {
  std::string escaped;
  for (char ch : state.candidate) { if (ch == '\\' || ch == '"') escaped.push_back('\\'); escaped.push_back(ch); }
  state.active = false; state.status = "completed"; state.reason = reason;
  state.result = "{\"status\":\"" + state.status + "\",\"reason\":\"" + state.reason +
                 "\",\"attempts\":" + std::to_string(state.attempts) +
                 ",\"matches\":" + std::to_string(state.matches) +
                 (state.candidate.empty() ? "" : ",\"output\":\"" + escaped + "\"") + "}";
}
bool limitsReached() {
  const double elapsed = std::chrono::duration<double>(
      std::chrono::steady_clock::now() - state.started).count();
  if (state.stopped) { finish("user"); return true; }
  if (state.possibility_limit == 0) {
    finish("possibility"); return true;
  }
  if (state.possibility_limit > 0 &&
      state.attempts >= static_cast<uint64_t>(state.possibility_limit)) {
    finish("possibility"); return true;
  }
  if (state.time_limit <= 0 || elapsed >= state.time_limit) {
    finish("time"); return true;
  }
  return false;
}
bool nextCandidate(std::string& value) {
  if (!state.cursor_initialized) {
    state.cursor.clear();
    if (state.pattern_index >= state.patterns.size()) {
      state.exhausted = true;
      return false;
    }
    for (const auto& domain : state.patterns[state.pattern_index]) {
      size_t width = 0;
      for (const auto& chars : domain) width += chars.size();
      if (width == 0) { state.exhausted = true; return false; }
      state.cursor.push_back(0);
    }
    state.cursor_initialized = true;
  } else {
    for (size_t i = state.cursor.size(); i-- > 0;) {
      size_t width = 0;
      for (const auto& chars : state.patterns[state.pattern_index][i]) width += chars.size();
      if (++state.cursor[i] < width) break;
      state.cursor[i] = 0;
      if (i == 0) {
        ++state.pattern_index;
        state.cursor_initialized = false;
        if (state.pattern_index >= state.patterns.size()) {
          state.exhausted = true;
          return false;
        }
        return nextCandidate(value);
      }
    }
  }

  int counts[5]{};
  std::vector<int> occurrences(256);
  char last = 0;
  value.clear();
  for (size_t i = 0; i < state.patterns[state.pattern_index].size(); ++i) {
    size_t offset = state.cursor[i];
    char ch = 0;
    for (const auto& chars : state.patterns[state.pattern_index][i]) {
      if (offset < chars.size()) { ch = chars[offset]; break; }
      offset -= chars.size();
    }
    const int category = std::isupper(static_cast<unsigned char>(ch)) ? 0 :
      std::islower(static_cast<unsigned char>(ch)) ? 1 :
      std::isdigit(static_cast<unsigned char>(ch)) ? 2 : ch == ' ' ? 4 : 3;
    if (counts[category] >= state.maxs[category] ||
        (!state.allow_consecutive && ch == last)) return false;
    const unsigned char index = static_cast<unsigned char>(ch);
    if ((!state.allow_repeat && occurrences[index]) ||
        (state.allow_repeat && occurrences[index] >= state.max_occurrence)) return false;
    value.push_back(ch);
    ++counts[category];
    ++occurrences[index];
    last = ch;
  }
  for (int i = 0; i < 5; ++i)
    if (counts[i] < state.mins[i] || counts[i] > state.maxs[i]) return false;
  return true;
}
}

extern "C" const char* calculate_hash(const char* input, const char* algorithm,
                                      const char* hash_type) {
  static std::string result;
  if (input == nullptr || algorithm == nullptr || hash_type == nullptr) {
    result = "ERROR: invalid hash request";
  } else if (std::strcmp(algorithm, "md5") != 0) {
    result = "ERROR: unsupported algorithm";
  } else if (std::strcmp(hash_type, "string") != 0) {
    result = "ERROR: unsupported hash type";
  } else {
    result = md5(input);
  }
  return result.c_str();
}

extern "C" const char* count_candidates(const char* config) {
  static std::string result;
  result = calculateCandidateCount(config);
  return result.c_str();
}

extern "C" void start_search(const char* target_hash, const char* config) {
  state = SearchState{};
  state.target = target_hash ? target_hash : "";
  const auto fields = split(config ? config : "", '|');
  if (fields.size() < 8) { finish("invalid-config"); return; }
  int allow = 0, consecutive = 0;
  state.time_limit = std::atof(fields[0].c_str());
  try {
    state.possibility_limit = std::stoll(fields[1]);
  } catch (...) {
    state.possibility_limit = 0;
  }
  parseInt(fields[2], state.max_matches); parseInt(fields[3], allow);
  parseInt(fields[4], state.max_occurrence); parseInt(fields[5], consecutive);
  state.allow_repeat = allow != 0; state.allow_consecutive = consecutive != 0;
  const auto countFields = split(fields[6], ',');
  for (size_t i = 0; i < 5 && i * 2 + 1 < countFields.size(); ++i) {
    parseInt(countFields[i * 2], state.mins[i]); parseInt(countFields[i * 2 + 1], state.maxs[i]);
  }
  for (const auto& encodedPattern : split(fields[7], '\x1f')) {
    std::vector<std::vector<std::string>> pattern;
    for (const auto& encodedPosition : split(encodedPattern, '\x1e')) {
      if (!encodedPosition.empty()) pattern.push_back({encodedPosition});
    }
    if (!pattern.empty()) state.patterns.push_back(std::move(pattern));
  }
  state.started = std::chrono::steady_clock::now(); state.active = true; state.status = "running";
  state.result = "{\"status\":\"running\",\"attempts\":0,\"matches\":0}";
}
extern "C" int search_step() {
  if (!state.active || state.paused) return state.active ? 1 : 0;
  if (limitsReached()) return 0;
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(12);
  std::string value;
  state.hit_deadline = false;
  while (state.active && !state.paused &&
         std::chrono::steady_clock::now() < deadline) {
    if (limitsReached()) break;
    if (!nextCandidate(value)) {
      if (state.exhausted) break;
      continue;
    }
    ++state.attempts;
    if (md5(value.c_str()) == state.target) {
      state.candidate = value; ++state.matches;
      finish("match");
      break;
    }
  }
  if (state.active && !state.paused && state.exhausted) finish("complete");
  if (state.active && !state.paused && !limitsReached()) {
    state.result = "{\"status\":\"running\",\"attempts\":" + std::to_string(state.attempts) +
      ",\"matches\":" + std::to_string(state.matches) + "}";
  }
  return state.active ? 1 : 0;
}
extern "C" void pause_search() { state.paused = true; state.status = "paused"; }
extern "C" void resume_search() { state.paused = false; state.status = "running"; }
extern "C" void stop_search() { state.stopped = true; }
extern "C" const char* get_search_result() { return state.result.c_str(); }
