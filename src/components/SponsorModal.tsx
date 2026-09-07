"use client";

import React, { useState, useEffect } from "react";
import { Heart, X, QrCode, Coffee, Sparkles } from "lucide-react";

interface SponsorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SponsorModal({ isOpen, onClose }: SponsorModalProps) {
  const [payType, setPayType] = useState<"wechat" | "alipay">("wechat");
  const [imgError, setImgError] = useState<Record<string, boolean>>({});

  // ESC key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-7 w-full max-w-sm sm:max-w-md shadow-2xl relative space-y-5 text-center transform transition-all animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
          aria-label="关闭"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon & Intro */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500/20 to-pink-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-500/10">
            <Heart className="w-6 h-6 fill-rose-500" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-wide flex items-center gap-1.5">
            <span>赞赏支持 X to PDF</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </h3>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
            工具完全免费、开源无任何强制广告。如果它帮到了您的工作或阅读，欢迎请作者喝杯咖啡 ☕ 您的支持是维护高速服务器与 AI 接口额度的持续动力！
          </p>
        </div>

        {/* Payment Tabs */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-white/10">
          <button
            onClick={() => setPayType("wechat")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              payType === "wechat"
                ? "bg-[#07C160]/20 text-[#07C160] border border-[#07C160]/40 shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#07C160]" />
            <span>微信支付</span>
          </button>
          <button
            onClick={() => setPayType("alipay")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              payType === "alipay"
                ? "bg-[#1677FF]/20 text-[#1677FF] border border-[#1677FF]/40 shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#1677FF]" />
            <span>支付宝</span>
          </button>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center">
          <div
            className={`bg-white p-2.5 rounded-2xl shadow-xl w-56 h-56 sm:w-60 sm:h-60 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-300 border-2 ${
              payType === "wechat"
                ? "border-[#07C160]/30 shadow-[#07C160]/10"
                : "border-[#1677FF]/30 shadow-[#1677FF]/10"
            }`}
          >
            {!imgError[payType] ? (
              <img
                src={payType === "wechat" ? "/wechat-reward.jpg" : "/alipay-reward.jpg"}
                alt={payType === "wechat" ? "微信赞赏码" : "支付宝赞赏码"}
                className="w-full h-full object-contain rounded-xl"
                onError={() => setImgError((prev) => ({ ...prev, [payType]: true }))}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-3 h-full">
                <QrCode
                  className={`w-14 h-14 mb-2 ${
                    payType === "wechat" ? "text-[#07C160]" : "text-[#1677FF]"
                  }`}
                />
                <span className="text-slate-900 font-bold text-xs">
                  {payType === "wechat" ? "微信收款码" : "支付宝收款码"}
                </span>
                <span className="text-slate-500 text-[10px] mt-1 leading-tight">
                  图片已就绪
                </span>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Coffee className="w-3.5 h-3.5 text-amber-400" />
            <span>金额随意 · 感谢您的每一份认可与支持</span>
          </div>
        </div>

        {/* Dismiss button */}
        <div className="pt-1">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            好的，稍后再说
          </button>
        </div>
      </div>
    </div>
  );
}
