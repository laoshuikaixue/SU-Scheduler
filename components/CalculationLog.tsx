import React, {useEffect, useRef} from 'react';
import {Activity, Cpu, Target, Terminal, Zap} from 'lucide-react';
import {CalculationStats} from '../services/scheduler';

interface CalculationLogProps {
    logs: string[];
    stats?: CalculationStats;
    isCalculating?: boolean;
}

const CalculationLog: React.FC<CalculationLogProps> = ({logs, stats, isCalculating}) => {
    const endRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // 使用 requestAnimationFrame 确保在渲染更新后立即执行滚动
        // 直接设置 scrollTop 比 scrollIntoView 更可靠且无动画延迟，确保实时跟进
        requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
            }
        });
    }, [logs]);

    return (
        <div
            className="w-full bg-slate-900 text-green-500 font-mono text-xs rounded-xl shadow-2xl mb-6 border border-slate-800 overflow-hidden shrink-0">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #334155; /* slate-700 */
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #475569; /* slate-600 */
                }
                /* Firefox */
                .custom-scrollbar {
                    scrollbar-width: thin;
                    scrollbar-color: #334155 transparent;
                }
            `}</style>
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <Terminal size={14}/>
                    <span className="font-bold text-green-400">MONITOR</span>
                </div>
                <div className="flex items-center gap-4 text-slate-400">
                    {isCalculating ? (
                        <div className="flex items-center gap-1 text-yellow-400 animate-pulse">
                            <Zap size={12}/>
                            <span>RUNNING</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <Cpu size={12}/>
                            <span>IDLE</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-col h-[420px]">
                {/* 实时统计仪表盘 */}
                <div className="p-4 bg-slate-950 border-b border-slate-800">

                    {/* 当前尝试状态 */}
                    <div
                        className="flex items-center justify-between mb-3 text-slate-400 text-[10px] uppercase tracking-wider">
                        <div className="flex items-center gap-1">
                            <Activity size={12}/>
                            <span>Iteration</span>
                        </div>
                        <span className="text-green-400 font-bold">
                            #{stats ? stats.attempt : 0} <span className="text-slate-600">/ {stats ? stats.maxAttempts : 100}</span>
                        </span>
                    </div>

                    {/* 指标对比网格 */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        {/* 当前步骤 */}
                        <div className="bg-slate-900/30 p-2 rounded border border-slate-800">
                            <div className="text-[10px] text-slate-500 mb-1">CURRENT STEP</div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-slate-400">Cov:</span>
                                <span
                                    className={stats && stats.coverage >= stats.bestCoverage ? "text-green-400" : "text-slate-500"}>
                                    {stats ? stats.coverage : 0}/{stats ? stats.totalSlots : 0}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Var:</span>
                                <span
                                    className={stats && stats.variance <= stats.bestVariance ? "text-green-400" : "text-slate-500"}>
                                    {stats ? stats.variance.toFixed(2) : '0.00'}
                                </span>
                            </div>
                        </div>

                        {/* 迄今最佳 */}
                        <div className="bg-slate-900/50 p-2 rounded border border-slate-800 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-1">
                                <Target size={12} className="text-yellow-500/50"/>
                            </div>
                            <div className="text-[10px] text-yellow-500/70 mb-1">BEST FOUND</div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-slate-400">Cov:</span>
                                <span className="text-yellow-400 font-bold">
                                    {stats ? stats.bestCoverage : 0}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Var:</span>
                                <span className="text-blue-400 font-bold">
                                    {stats ? stats.bestVariance.toFixed(2) : '0.00'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 进度条 */}
                    <div className="space-y-2">
                        <div>
                            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                                <span>Coverage Optimization</span>
                                <span>{stats ? ((stats.bestCoverage / stats.totalSlots) * 100).toFixed(1) : 0}%</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1 rounded overflow-hidden">
                                <div
                                    className="bg-yellow-500 h-full transition-all duration-100"
                                    style={{width: stats ? `${(stats.bestCoverage / stats.totalSlots) * 100}%` : '0%'}}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                                <span>Search Progress</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1 rounded overflow-hidden">
                                <div
                                    className="bg-green-500 h-full transition-all duration-100"
                                    style={{width: stats ? `${(stats.attempt / stats.maxAttempts) * 100}%` : '0%'}}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 日志 */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 p-3 overflow-y-auto custom-scrollbar relative text-[10px] leading-relaxed font-mono">
                    {logs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                            <p>System Ready.</p>
                        </div>
                    ) : (
                        <>
                            {logs.map((log, i) => (
                                <div key={i} className="mb-1 break-words hover:bg-slate-800/50 px-1 rounded opacity-80">
                                    <span className="mr-2 text-slate-600">[{i}]</span>
                                    <span
                                        className={log.includes('>>>') ? 'text-yellow-400 font-bold' : 'text-green-400'}>
                                        {log.replace(/\[.*?\]/, '')}
                                    </span>
                                </div>
                            ))}
                            <div ref={endRef}/>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CalculationLog;
