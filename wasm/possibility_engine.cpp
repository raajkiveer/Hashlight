#include <cstdint>
#include <cstdlib>
#include <sstream>
#include <string>
#include <vector>

namespace {
struct State {
  bool allow_repeat = false;
  bool allow_consecutive = false;
  int max_occurrence = 1;
  int mins[5]{};
  int maxs[5]{};
  std::vector<std::vector<std::string>> slots;
};

std::vector<std::string> split(const std::string& value, char delimiter) {
  std::vector<std::string> result;
  std::stringstream stream(value);
  std::string part;
  while (std::getline(stream, part, delimiter)) result.push_back(part);
  return result;
}

int category(char value) {
  if (value >= 'A' && value <= 'Z') return 0;
  if (value >= 'a' && value <= 'z') return 1;
  if (value >= '0' && value <= '9') return 2;
  if (value == ' ') return 4;
  return 3;
}

uint64_t walk(const State& state, const std::vector<std::string>& domains,
              size_t position, int counts[5], std::vector<int>& occurrences,
              char last) {
  if (position == domains.size()) {
    for (int i = 0; i < 5; ++i)
      if (counts[i] < state.mins[i] || counts[i] > state.maxs[i]) return 0;
    return 1;
  }

  uint64_t total = 0;
  for (char value : domains[position]) {
    const int type = category(value);
    if (counts[type] >= state.maxs[type]) continue;
    if (!state.allow_consecutive && value == last) continue;
    const unsigned char index = static_cast<unsigned char>(value);
    if ((!state.allow_repeat && occurrences[index] > 0) ||
        (state.allow_repeat && occurrences[index] >= state.max_occurrence))
      continue;
    ++counts[type];
    ++occurrences[index];
    total += walk(state, domains, position + 1, counts, occurrences, value);
    --occurrences[index];
    --counts[type];
  }
  return total;
}
}

extern "C" const char* calculate_possibilities(const char* config) {
  static std::string result;
  State state;
  const auto fields = split(config ? config : "", '|');
  if (fields.size() < 4) {
    result = "ERROR: invalid possibility configuration";
    return result.c_str();
  }
  state.allow_repeat = std::atoi(fields[0].c_str()) != 0;
  state.max_occurrence = std::atoi(fields[1].c_str());
  state.allow_consecutive = std::atoi(fields[2].c_str()) != 0;
  const auto count_fields = split(fields[3], ',');
  for (size_t i = 0; i < 5 && i * 2 + 1 < count_fields.size(); ++i) {
    state.mins[i] = std::atoi(count_fields[i * 2].c_str());
    state.maxs[i] = std::atoi(count_fields[i * 2 + 1].c_str());
  }
  for (const auto& encoded_slot : split(fields.size() > 4 ? fields[4] : "", '\x1f')) {
    std::vector<std::string> domains;
    for (const auto& domain : split(encoded_slot, '\x1e'))
      domains.push_back(domain);
    if (!domains.empty()) state.slots.push_back(std::move(domains));
  }

  uint64_t total = 0;
  for (const auto& domains : state.slots) {
    int counts[5]{};
    std::vector<int> occurrences(256);
    total += walk(state, domains, 0, counts, occurrences, 0);
  }
  result = std::to_string(total);
  return result.c_str();
}
