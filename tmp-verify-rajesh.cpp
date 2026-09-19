#include "wasm/hash_engine.cpp"
#include <iostream>
#include <string>
int main(){
std::string c="120|-1|1|1|6|1|0,6,0,6,0,6,0,6,0,6|ABCDEFGHIJKLMNOPQRSTUVWXYZ\x1eabcdefghijklmnopqrstuvwxyz\x1eabcdefghijklmnopqrstuvwxyz\x1eabcdefghijklmnopqrstuvwxyz\x1eabcdefghijklmnopqrstuvwxyz\x1eh";
start_search("99bd974fae48638b5d62ca32f7645637",c.c_str());
while(search_step()){}
std::cout<<get_search_result()<<"\n";
}
