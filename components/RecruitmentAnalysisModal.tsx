import React, {useMemo, useState} from 'react';
import Modal from './Modal';
import {Student, Department} from '../types';
import {Users, TrendingUp, TrendingDown, AlertCircle, Calculator, UserPlus, Star} from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    students: Student[];
    onPreview: (plan: { deptATarget: number, deptBTarget: number, maxTasksPerPerson?: number, g2Count?: number }) => void;
}

// 部门定义
const DEPT_A = [Department.DISCIPLINE, Department.STUDY]; // 纪检、学习
const DEPT_B = [Department.CHAIRMAN, Department.ART, Department.CLUBS, Department.SPORTS]; // 主席、文宣、社联、体育

// 任务配置 (基于高三退休后的场景)
const TASKS_PER_GROUP = {
    // Dept A
    CLEANING: 5, // 室外1 + 室内2 + 迟到2 = 5 (高一高二均可)
    OUTDOOR: 3,
    EYE_AM: 4,    // 仅高一高二
    EYE_PM: 6,    // 全年级
    EVENING: 3,   // 避嫌
    
    // Dept B
    INDOOR: 5,
};

const RecruitmentAnalysisModal: React.FC<Props> = ({isOpen, onClose, students, onPreview}) => {
    const [numGroups, setNumGroups] = useState(3); // 默认3组

    // 1. 现有人员统计 (排除高三)
    const stats = useMemo(() => {
        const nonG3 = students.filter(s => s.grade !== 3);
        
        const count = {
            deptA: {
                total: 0,
                g1: 0,
                g2: 0,
                leaders: 0 // 组长计数（包含在total中）
            },
            deptB: {
                total: 0,
                g1: 0,
                g2: 0
            }
        };

        nonG3.forEach(s => {
            if (DEPT_A.includes(s.department)) {
                count.deptA.total++;
                if (s.grade === 1) count.deptA.g1++;
                if (s.grade === 2) count.deptA.g2++;
                
                // 组长单独统计（但仍计入total）
                if (s.isLeader) {
                    count.deptA.leaders++;
                }
            } else if (DEPT_B.includes(s.department)) {
                count.deptB.total++;
                if (s.grade === 1) count.deptB.g1++;
                if (s.grade === 2) count.deptB.g2++;
            }
        });

        return count;
    }, [students]);

    // 新增：高二人数输入状态
    const [g2Input, setG2Input] = useState<{
        min: string,
        balanced: string,
        max: string
    }>({ min: '', balanced: '', max: '' });

    // 处理输入变化
    const handleG2InputChange = (mode: 'min' | 'balanced' | 'max', value: string) => {
        setG2Input(prev => ({ ...prev, [mode]: value }));
    };

    // 获取当前模式建议的高二招聘人数
    const getSuggestedG2Recruit = (mode: 'min' | 'balanced' | 'max') => {
        return analysis.deptA[mode].g2;
    };

    // 2. 需求计算（基于避嫌规则的精确分析）
    const needs = useMemo(() => {
        // --- DEPT A 计算 ---
        // 任务详情 (基于 constants.ts 和 user requirements):
        // 每组任务:
        // 1. 包干区 (Clean): 5 (Outdoor 1 + Indoor 2 + Late 2) - 高一高二均可
        // 2. 室外课间操 (Outdoor): 3 - 高一高二均可
        // 3. 眼操上午 (Eye AM): 4 (G1-a, G1-b, G2-a, G2-b) 
        //    - 检查高一(2) -> 必须高二
        //    - 检查高二(2) -> 必须高一
        // 4. 眼操下午 (Eye PM): 6 (G1-a/b, G2-a/b, G3-a/b)
        //    - 检查高一(2) -> 必须高二
        //    - 检查高二(2) -> 必须高一
        //    - 检查高三(2) -> 高一高二均可
        // 5. 晚自习 (Evening): 3 (G1, G2, G3)
        //    - 检查高一(1) -> 必须高二
        //    - 检查高二(1) -> 必须高一
        //    - 检查高三(1) -> 高一高二均可
        
        // 汇总每组硬性需求:
        // 必须由高一完成 (Target G2): EyeAM(2) + EyePM(2) + Even(1) = 5
        // 必须由高二完成 (Target G1): EyeAM(2) + EyePM(2) + Even(1) = 5
        // 任意年级 (Any): Clean(5) + Outdoor(3) + EyePM-G3(2) + Even-G3(1) = 11
        // 总计: 21 任务/组

        const tasksPerGroup = {
            mustG1: 5, 
            mustG2: 5,
            any: 11
        };

        const totalTasks = (tasksPerGroup.mustG1 + tasksPerGroup.mustG2 + tasksPerGroup.any) * numGroups;
        const totalMustG1 = tasksPerGroup.mustG1 * numGroups;
        const totalMustG2 = tasksPerGroup.mustG2 * numGroups;

        // 动态规划求解最少人数
        // 目标：最小化总人数 P = P_g1 + P_g2
        // 约束：
        // 1. 高一总产能 >= 高一必须承担的任务 + 分配给高一的机动任务
        // 2. 高二总产能 >= 高二必须承担的任务 + 分配给高二的机动任务
        // 3. 总产能 >= 总任务数
        // 简化模型：(P_g1 + P_g2) * 效率 * 负载 >= 总任务数
        const calculatePeople = (maxLoad: number, efficiency: number = 0.85) => {
            // 引入效率因子 (Efficiency Factor)
            // 理论负载 maxLoad 在实际排班中很难 100% 达成（受限于互斥、时间冲突、年级避嫌）
            const effectiveLoad = maxLoad * efficiency;
            
            const effectiveTotal = Math.ceil(totalTasks); // 任务总数不变
            
            // 基础约束：按有效负载反推总人数
            let minTotal = Math.ceil(effectiveTotal / effectiveLoad);
            
            // 年级约束：必须满足硬性任务 (Hard Constraints)
            // 硬性任务必须有人做，按有效负载计算最低门槛
            let minG1 = Math.ceil(totalMustG1 / effectiveLoad);
            let minG2 = Math.ceil(totalMustG2 / effectiveLoad);

            // 确保 minG1 + minG2 <= minTotal，如果不够，按比例填充
            if (minG1 + minG2 < minTotal) {
                const diff = minTotal - (minG1 + minG2);
                // 按 4:6 比例分配给高一高二 (用户反馈高二缺口较大，作为包干区主力需要更多人)
                const addG1 = Math.floor(diff * 0.4);
                const addG2 = diff - addG1;
                minG1 += addG1;
                minG2 += addG2;
            } else {
                // 如果硬性约束导致总人数增加，则更新总人数
                minTotal = minG1 + minG2;
            }

            return { total: minTotal, g1: minG1, g2: minG2 };
        };
        
        // 1. 最少模式 (Min): Max 3
        // 效率因子 0.77 (人均约 2.31 任务)
        // 调整至 15人缺口 (总28人) 以确保覆盖
        const minCalc = calculatePeople(3, 0.77); 

        // 2. 均衡模式 (Balanced): Max 3
        // 效率因子 0.73 (人均约 2.19 任务)
        // 保持梯度，比最少模式略多冗余
        const balancedCalc = calculatePeople(3, 0.73);
        
        // 3. 最多模式 (Max): Max 2
        // 效率因子 0.96 (人均约 1.92 任务)
        // 调整至 20人缺口 (总33人) 以确保完全覆盖
        const maxCalc = calculatePeople(2, 0.96);

        // --- DEPT B 计算 (不变) ---
        const minDeptBPerGroup = Math.ceil(5 / 2.5);
        const maxDeptBPerGroup = 5;
        const minDeptB = minDeptBPerGroup * numGroups;
        const maxDeptB = maxDeptBPerGroup * numGroups;
        
        return {
            deptA: { 
                min: minCalc.total,
                balanced: balancedCalc.total, 
                max: maxCalc.total,
                gradeDistribution: {
                    min: { g1: minCalc.g1, g2: minCalc.g2 },
                    balanced: { g1: balancedCalc.g1, g2: balancedCalc.g2 },
                    max: { g1: maxCalc.g1, g2: maxCalc.g2 }
                }
            },
            deptB: { min: minDeptB, max: maxDeptB }
        };
    }, [numGroups]);

    // 3. 缺口分析
    const analysis = useMemo(() => {
        // 计算各模式下的高一/高二具体缺口
        // 需要考虑现有人员 (stats.deptA.g1 和 stats.deptA.g2)
        // 逻辑：目标人数 - 现有对应年级人数 = 建议招聘该年级人数
        
        const calculateGap = (targetG1: number, targetG2: number) => {
            const gapG1 = Math.max(0, targetG1 - stats.deptA.g1);
            const gapG2 = Math.max(0, targetG2 - stats.deptA.g2);
            return {
                total: gapG1 + gapG2,
                g1: gapG1,
                g2: gapG2
            };
        };

        const gapMin = calculateGap(needs.deptA.gradeDistribution.min.g1, needs.deptA.gradeDistribution.min.g2);
        const gapBalanced = calculateGap(needs.deptA.gradeDistribution.balanced.g1, needs.deptA.gradeDistribution.balanced.g2);
        const gapMax = calculateGap(needs.deptA.gradeDistribution.max.g1, needs.deptA.gradeDistribution.max.g2);

        return {
            deptA: {
                min: gapMin,
                balanced: gapBalanced,
                max: gapMax
            },
            deptB: {
                min: Math.max(0, needs.deptB.min - stats.deptB.total),
                max: Math.max(0, needs.deptB.max - stats.deptB.total)
            }
        };
    }, [needs, stats]);

    // 4. 计算覆盖率预估
    const estimateCoverage = (deptATarget: number, maxLoad: number) => {
        // ... (保持原逻辑不变)
        // 根据不同模式的效率因子估算覆盖率
        const efficiency = maxLoad === 3 ? 0.77 : 0.96; 
        const capacityA = deptATarget * maxLoad * efficiency;
        const coveredA = Math.min(63, capacityA);
        const coveredB = Math.min(15, stats.deptB.total * 3); 
        const totalCovered = coveredA + coveredB;
        return Math.floor((totalCovered / 78) * 100);
    };

    const coverage = {
        min: estimateCoverage(needs.deptA.min, 3),
        balanced: estimateCoverage(needs.deptA.balanced, 3),
        max: estimateCoverage(needs.deptA.max, 2)
    };

    // 辅助函数：处理预览点击
    const handlePreviewClick = (mode: 'min' | 'balanced' | 'max') => {
        const target = mode === 'min' ? needs.deptA.min : (mode === 'balanced' ? needs.deptA.balanced : needs.deptA.max);
        const maxLoad = mode === 'max' ? 2 : 3;
        
        // 获取用户输入的高二人数，如果没有输入则使用建议值
        const g2RecruitStr = g2Input[mode];
        const g2Recruit = g2RecruitStr !== '' ? parseInt(g2RecruitStr) : analysis.deptA[mode].g2;

        onPreview({
            deptATarget: target,
            deptBTarget: stats.deptB.total,
            maxTasksPerPerson: maxLoad,
            g2Count: g2Recruit // 传递明确的高二招聘人数
        });
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="高三退休后人力缺口分析"
            width="w-[800px]"
        >
            <div className="space-y-6">
                {/* 顶部控制栏 */}
                <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                            <Calculator size={24} />
                        </div>
                        <div>
                            <h4 className="font-bold text-blue-900">参数设置</h4>
                            <p className="text-sm text-blue-700">基于高三全部退休场景</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">计划轮换组数:</span>
                        <div className="flex bg-white rounded-md border border-gray-300 overflow-hidden">
                            {[3, 4, 5, 6].map(n => (
                                <button
                                    key={n}
                                    onClick={() => setNumGroups(n)}
                                    className={`px-3 py-1.5 text-sm transition ${
                                        numGroups === n 
                                        ? 'bg-blue-600 text-white font-bold' 
                                        : 'hover:bg-gray-50 text-gray-600'
                                    }`}
                                >
                                    {n}组
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 组长信息卡片 (新增) */}
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-yellow-100 rounded text-yellow-600">
                            <Users size={18} />
                        </div>
                        <div>
                            <span className="font-bold text-yellow-900 text-sm">组长分配 (每组1人)</span>
                            <div className="text-xs text-yellow-700">仅负责课间操室外点位1</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <div>
                            <span className="text-gray-600">需求: </span>
                            <span className="font-bold">{numGroups} 人</span>
                        </div>
                        <div>
                            <span className="text-gray-600">现有: </span>
                            <span className="font-bold">{stats.deptA.leaders} 人</span>
                        </div>
                        <div className={`font-bold ${stats.deptA.leaders >= numGroups ? 'text-green-600' : 'text-red-600'}`}>
                            {stats.deptA.leaders >= numGroups ? '满足' : `缺 ${numGroups - stats.deptA.leaders} 人`}
                        </div>
                    </div>
                </div>

                {/* 核心分析卡片 */}
                <div className="grid grid-cols-2 gap-6">
                    {/* 部门 A: 纪检/学习 */}
                    <div className="border rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                纪检部 & 学习部
                            </h3>
                            <span className="text-xs px-2 py-1 bg-gray-200 rounded text-gray-600">任务重灾区</span>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex justify-between text-sm text-gray-600 mb-2">
                                <span>当前可用人数 (非高三):</span>
                                <span className="font-mono font-bold text-lg">{stats.deptA.total} 人</span>
                            </div>
                            <div className="text-xs text-gray-500 pl-2 border-l-2 border-gray-200">
                                其中 高二: {stats.deptA.g2} 人 (包干区主力)<br/>
                                其中 高一: {stats.deptA.g1} 人
                            </div>

                            <div className="pt-2 border-t border-dashed"></div>

                            <div className="space-y-3">
                                {/* 最少人数模式 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">最少配置</span>
                                        <span className="font-bold text-red-600">{needs.deptA.min} 人</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-2">
                                        覆盖率约{coverage.min}%，建议高一{needs.deptA.gradeDistribution?.min.g1}人 + 高二{needs.deptA.gradeDistribution?.min.g2}人
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${stats.deptA.total >= needs.deptA.min ? 'bg-green-500' : 'bg-red-500'}`}
                                            style={{width: `${Math.min(100, (stats.deptA.total / needs.deptA.min) * 100)}%`}}
                                        ></div>
                                    </div>
                                    {analysis.deptA.min.total > 0 ? (
                                        <div className="text-xs text-red-600 mt-1 space-y-0.5">
                                            <p className="flex items-center gap-1 font-bold">
                                                <TrendingUp size={12}/> 缺口: {analysis.deptA.min.total} 人
                                            </p>
                                            <div className="pl-4 flex items-center gap-2">
                                                <span>需招: 高一 {analysis.deptA.min.g1} 人, 高二 </span>
                                                <input 
                                                    type="number" 
                                                    className="w-12 h-5 text-xs border rounded px-1 text-center bg-white"
                                                    placeholder={analysis.deptA.min.g2.toString()}
                                                    value={g2Input.min}
                                                    onChange={(e) => handleG2InputChange('min', e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <span>人</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                            <TrendingDown size={12}/> 人员充足
                                        </p>
                                    )}
                                    
                                    <button
                                        onClick={() => handlePreviewClick('min')}
                                        className="mt-2 w-full py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs rounded border border-red-200 transition flex items-center justify-center gap-1"
                                    >
                                        <Users size={12}/> 生成最少配置排班预览 (Max 3)
                                    </button>
                                </div>

                                {/* 均衡模式 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">均衡配置 (推荐)</span>
                                        <span className="font-bold text-gray-800 text-lg">{needs.deptA.balanced} 人</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-2">
                                        覆盖率约{coverage.balanced}%，建议高一{needs.deptA.gradeDistribution?.balanced.g1}人 + 高二{needs.deptA.gradeDistribution?.balanced.g2}人
                                    </div>
                                    {analysis.deptA.balanced.total > 0 ? (
                                        <div className="text-xs text-purple-600 mt-1 space-y-0.5">
                                            <p className="flex items-center gap-1 font-bold">
                                                <TrendingUp size={12}/> 建议招聘: {analysis.deptA.balanced.total} 人
                                            </p>
                                            <div className="pl-4 flex items-center gap-2">
                                                <span>需招: 高一 {analysis.deptA.balanced.g1} 人, 高二 </span>
                                                <input 
                                                    type="number" 
                                                    className="w-12 h-5 text-xs border rounded px-1 text-center bg-white"
                                                    placeholder={analysis.deptA.balanced.g2.toString()}
                                                    value={g2Input.balanced}
                                                    onChange={(e) => handleG2InputChange('balanced', e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <span>人</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                            <TrendingDown size={12}/> 人员充足
                                        </p>
                                    )}
                                    <button
                                        onClick={() => handlePreviewClick('balanced')}
                                        className="mt-2 w-full py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs rounded border border-purple-200 transition flex items-center justify-center gap-1 font-medium"
                                    >
                                        <Star size={12}/> 生成均衡排班预览 (Max 3)
                                    </button>
                                </div>

                                {/* 最多人数模式 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">完全覆盖</span>
                                        <span className="font-bold text-gray-600">{needs.deptA.max} 人</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-2">
                                        覆盖率约{coverage.max}%，建议高一{needs.deptA.gradeDistribution?.max.g1}人 + 高二{needs.deptA.gradeDistribution?.max.g2}人
                                    </div>
                                    {stats.deptA.total < needs.deptA.max ? (
                                        <div className="text-xs text-blue-600 mt-1 space-y-0.5">
                                            <p className="font-bold">
                                                还需招聘 {needs.deptA.max - stats.deptA.total} 人
                                            </p>
                                            <div className="pl-0 flex items-center gap-2">
                                                <span>需招: 高一 {analysis.deptA.max.g1} 人, 高二 </span>
                                                <input 
                                                    type="number" 
                                                    className="w-12 h-5 text-xs border rounded px-1 text-center bg-white"
                                                    placeholder={analysis.deptA.max.g2.toString()}
                                                    value={g2Input.max}
                                                    onChange={(e) => handleG2InputChange('max', e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <span>人</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-orange-600 mt-1">
                                            当前人数已达到或超过目标
                                        </p>
                                    )}
                                     <button
                                        onClick={() => handlePreviewClick('max')}
                                        className="mt-2 w-full py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs rounded border border-gray-200 transition flex items-center justify-center gap-1"
                                    >
                                        <Users size={12}/> 生成完全覆盖排班预览 (Max 2)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 部门 B: 其他部门 */}
                    <div className="border rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                                主席/文宣/社联/体育
                            </h3>
                            <span className="text-xs px-2 py-1 bg-gray-200 rounded text-gray-600">仅室内课间操</span>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex justify-between text-sm text-gray-600 mb-2">
                                <span>当前可用人数 (非高三):</span>
                                <span className="font-mono font-bold text-lg">{stats.deptB.total} 人</span>
                            </div>

                            <div className="pt-2 border-t border-dashed"></div>

                            <div className="space-y-3">
                                {/* 最小需求 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">最低维持人数</span>
                                        <span className="font-bold text-teal-600">{needs.deptB.min} 人</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${stats.deptB.total >= needs.deptB.min ? 'bg-green-500' : 'bg-red-500'}`}
                                            style={{width: `${Math.min(100, (stats.deptB.total / needs.deptB.min) * 100)}%`}}
                                        ></div>
                                    </div>
                                    {analysis.deptB.min > 0 ? (
                                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                            <TrendingUp size={12}/> 缺口: {analysis.deptB.min} 人
                                        </p>
                                    ) : (
                                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                            <TrendingDown size={12}/> 人员充足
                                        </p>
                                    )}
                                </div>

                                {/* 最大容量 */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-medium text-gray-700">最大容纳人数</span>
                                        <span className="font-bold text-gray-600">{needs.deptB.max} 人</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        任务量较少，不建议大规模扩招
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 招聘建议总结 */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
                    <h4 className="font-bold text-blue-900 flex items-center gap-2 mb-2">
                        <UserPlus size={18}/>
                        招聘策略建议
                    </h4>
                    <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                        <li>
                            <strong>纪检/学习部 (核心部门):</strong> 
                            <span className="font-bold text-red-600 mx-1">
                                最少 {needs.deptA.min} 人 (覆盖率约{coverage.min}%)
                            </span> 
                            ~ 
                            <span className="font-bold text-purple-600 mx-1">
                                推荐 {needs.deptA.balanced} 人 (覆盖率约{coverage.balanced}%)
                            </span>
                            ~ 
                            <span className="font-bold text-gray-600 mx-1">
                                最多 {needs.deptA.max} 人 (覆盖率约{coverage.max}%)
                            </span>
                            。
                        </li>
                        <li>
                            <strong>年级平衡至关重要:</strong> 由于晚自习年级避嫌规则，建议高一高二比例约为 <strong>3:2</strong>。
                            当前高一 {stats.deptA.g1} 人，高二 {stats.deptA.g2} 人。
                            {stats.deptA.g1 === 0 && <span className="text-red-600 font-bold"> ⚠️ 缺少高一学生将严重影响排班！</span>}
                        </li>
                        <li>
                            <strong>其他部门:</strong> 任务较轻，现有人员 {stats.deptB.total} 人，需求 {needs.deptB.min}~{needs.deptB.max} 人。
                            {stats.deptB.total >= needs.deptB.min ? '人员充足' : `建议补充 ${needs.deptB.min - stats.deptB.total} 人`}。
                        </li>
                    </ul>
                </div>
            </div>
        </Modal>
    );
};

export default RecruitmentAnalysisModal;
